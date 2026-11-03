import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { expandTiling } from "../src/core/tiling";
import { ensureNativeTiler } from "./lib/native-tiler";
import { ruleOutSide } from "./lib/side-bound";
import { DataStore, PROJECT_ROOT, printHelpIfAsked } from "./lib/store";

const USAGE = `Raises "no rectangle with a side of at most N" for pieces whose rectifiability is open.

Usage: npx tsx tools/side-bounds.ts --only <ids> [options]

  --only <ids>       comma-separated IDs (required; each needs an open rectifiable record, and
                     a note saying "a side of at most N" sets the bound to beat)
  --max-side <n>     largest side to try (default 120)
  --budget <nodes>   native node budget per rectangle search (default 20000000000)
  --workers <n>      sides searched at once (default 8)

Every side from 1 up is searched (small ones take moments), so the half-strip claim covers all
widths up to the bound; a later run resumes after a bound whose note already has that claim. For each side s, one long run from the left wall decides every width
past the column it reached (and the half-strip of width s), and the narrower widths are searched
one by one (tools/lib/side-bound.ts). The bound moves up over contiguous ruled-out sides and is
saved once it passes the recorded bound, with the order's lower bound that follows from it. Log: output/side-bounds/run.log.`;

const SIDE_NOTE = /a side of at most (\d+)/;
const HALF_STRIP_NOTE = /every half-strip of width at most (\d+)/;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const ids = argument("--only", "").split(",").filter(Boolean);
const maxSide = Number(argument("--max-side", "120"));
const budget = Number(argument("--budget", "20000000000"));
const workers = Number(argument("--workers", "8"));
if (ids.length === 0) throw new Error("--only is required");
for (const value of [maxSide, budget, workers])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`numeric options must be positive integers, got ${value}`);

const store = new DataStore();
interface PieceState {
  readonly shape: Polyomino;
  /** The bound in the data when the run started. */
  readonly recorded: number;
  /** Proven in this run, from side 1 up: covers rectangles and half-strips alike. */
  bound: number;
  stopped: boolean;
  readonly ruledOut: Set<number>;
}
const pieces: PieceState[] = ids.map((id) => {
  const shape = Polyomino.fromId(id);
  const record = store.entry(shape).properties.rectifiable;
  const match = SIDE_NOTE.exec(record?.note ?? "");
  if (record?.status !== "open")
    throw new Error(`${id}: needs an open rectifiable record`);
  // A half-strip clause means this tool proved the bound from side 1 already: resume after it.
  const verified = HALF_STRIP_NOTE.exec(record.note ?? "");
  return {
    shape,
    recorded: match === null ? 0 : Number(match[1]),
    bound: verified === null ? 0 : Number(verified[1]),
    stopped: false,
    ruledOut: new Set(),
  };
});

const logDir = join(PROJECT_ROOT, "output", "side-bounds");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, "run.log");
const log = (line: string): void => {
  appendFileSync(logPath, `${line}\n`);
  console.log(line);
};
log(
  `# ${new Date().toISOString()} ${JSON.stringify({ ids, maxSide, budget, workers })}`,
);

/** The rectifiable note this tool writes; the two numbers are how a later run resumes. */
function sideBoundNote(bound: number): string {
  return `Not resolved by this site's searches. Exact column searches rule out every rectangle with a side of at most ${bound}, and every half-strip of width at most ${bound}.`;
}

function saveBound(piece: PieceState): void {
  const { shape, bound } = piece;
  const properties = store.entry(shape).properties;
  const rectifiable = properties.rectifiable as PropertyRecord<boolean>;
  const note = sideBoundNote(bound);
  store.replaceOpen(shape, "rectifiable", { ...rectifiable, note });
  const order = properties.order as PropertyRecord<number> | undefined;
  const fromSides = Math.ceil(((bound + 1) * (bound + 1)) / shape.size);
  if (order?.status === "open" && (order.lower ?? 0) < fromSides)
    store.replaceOpen(shape, "order", {
      status: "open",
      lower: fromSides,
      ref: "site-solver",
      note: `Every tileable rectangle has both sides above ${bound}, so it holds at least ${fromSides} copies; the piece may not tile any rectangle.`,
    });
  store.save();
  log(`${shape.id}: bound ${bound}`);
}

const jobs: { piece: PieceState; side: number }[] = [];
for (let side = 1; side <= maxSide; side++)
  for (const piece of pieces)
    if (side > piece.bound) jobs.push({ piece, side });

ensureNativeTiler();
let next = 0;
const lane = async (): Promise<void> => {
  for (let job = jobs[next++]; job !== undefined; job = jobs[next++]) {
    const { piece, side } = job;
    if (piece.stopped) continue;
    const started = Date.now();
    const verdict = await ruleOutSide(piece.shape, side, budget);
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (verdict.kind === "found") {
      const { width, height, placements } = verdict.result;
      const problems = expandTiling(
        piece.shape,
        width,
        height,
        placements,
      ).problems;
      if (problems.length > 0)
        throw new Error(`${piece.shape.id}: invalid tiling: ${problems[0]}`);
      store.writeTiling(piece.shape, {
        width,
        height,
        placements,
        ref: "site-solver",
        note: "Found by tools/side-bounds.ts.",
      });
      piece.stopped = true;
      log(
        `FOUND ${piece.shape.id} ${width}x${height}: the piece tiles a rectangle (${seconds} s)`,
      );
      continue;
    }
    if (verdict.kind === "undecided") {
      piece.stopped = true;
      log(
        `${piece.shape.id} side ${side}: undecided, ${verdict.why} (${seconds} s)`,
      );
      continue;
    }
    log(
      `${piece.shape.id} side ${side}: ruled out, widths to ${verdict.longestChecked} one by one (${seconds} s)`,
    );
    piece.ruledOut.add(side);
    const before = piece.bound;
    while (piece.ruledOut.has(piece.bound + 1)) piece.bound++;
    if (piece.bound > before && piece.bound > piece.recorded) saveBound(piece);
  }
};
await Promise.all(Array.from({ length: workers }, lane));
log(`# done ${pieces.map((p) => `${p.shape.id}: ${p.bound}`).join(", ")}`);
