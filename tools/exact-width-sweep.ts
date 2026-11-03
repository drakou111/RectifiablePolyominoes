import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Polyomino } from "../src/core/polyomino";
import { requiredBuild, runExactWidth } from "./lib/exact-width";
import { HALF_STRIP_NOTE, recordSideBound } from "./lib/side-bound";
import { DataStore, PROJECT_ROOT, printHelpIfAsked } from "./lib/store";

const USAGE = `Raises "no rectangle with a side of at most N" with the exact width program.

Usage: npx tsx tools/exact-width-sweep.ts --only <ids> [options]

  --only <ids>       comma-separated IDs (required); each needs an open rectifiable record whose
                     note says "every half-strip of width at most N" (from tools/side-bounds.ts),
                     with N covering the widths below the piece's reach
  --max-side <n>     largest width to decide (default 400)
  --jobs <n>         widths decided at once (default 5)
  --threads <n>      threads per width (default 4)
  --start-row <n>    rows built width-independently (default 1, see tools/lib/exact-width.ts)
  --from <n>         decide widths above n again (at most the recorded N, at least the reach - 1)
  --dry-run          report only: no data or log written

Widths go up from N + 1. A dead width has no rectangle with that side and no half-strip of
that width, so the bound moves up over contiguous dead widths and is saved as it does. A piece
stops at a width whose half-strip tiles a rectangle (the piece is rectifiable: find that
rectangle's tiling with the other tools) or fills forever (this method cannot pass it).
Log: output/exact-width/sweep.log.`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const ids = argument("--only", "").split(",").filter(Boolean);
const maxSide = Number(argument("--max-side", "400"));
const jobCount = Number(argument("--jobs", "5"));
const threads = Number(argument("--threads", "4"));
const startRow = Number(argument("--start-row", "1"));
const dryRun = process.argv.includes("--dry-run");
const fromText = argument("--from", "");
const from = fromText === "" ? undefined : Number(fromText);
if (from !== undefined && (!Number.isInteger(from) || from < 0))
  throw new Error(`--from must be a whole number, got ${fromText}`);
if (ids.length === 0) throw new Error("--only is required");
for (const value of [maxSide, jobCount, threads])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`numeric options must be positive integers, got ${value}`);
if (!Number.isInteger(startRow) || startRow < 0)
  throw new Error(`--start-row must be a whole number, got ${startRow}`);

const store = new DataStore();
interface PieceState {
  readonly shape: Polyomino;
  /** Proven from width 1 up. */
  bound: number;
  stopped: boolean;
  readonly dead: Set<number>;
}
const pieces: PieceState[] = ids.map((id) => {
  const shape = Polyomino.fromId(id);
  if (shape.canonical().id !== id)
    throw new Error(`${id} is not a canonical ID`);
  const record = store.entry(shape).properties.rectifiable;
  if (record?.status !== "open")
    throw new Error(`${id}: needs an open rectifiable record`);
  const proven = HALF_STRIP_NOTE.exec(record.note ?? "");
  const reach = requiredBuild(shape).leftReach;
  if (proven === null || Number(proven[1]) < reach - 1)
    throw new Error(
      `${id}: needs half-strips ruled out up to width ${reach - 1} first (tools/side-bounds.ts), since exact_width runs widths of at least ${reach}`,
    );
  if (from !== undefined && (from > Number(proven[1]) || from < reach - 1))
    throw new Error(
      `${id}: --from ${from} must lie between ${reach - 1} and the recorded ${proven[1]}`,
    );
  return {
    shape,
    bound: from ?? Number(proven[1]),
    stopped: false,
    dead: new Set(),
  };
});

const logDir = join(PROJECT_ROOT, "output", "exact-width");
if (!dryRun) mkdirSync(logDir, { recursive: true });
const log = (line: string): void => {
  if (!dryRun) appendFileSync(join(logDir, "sweep.log"), `${line}\n`);
  console.log(line);
};
log(
  `# ${new Date().toISOString()} ${JSON.stringify({ ids, maxSide, jobCount, threads, startRow, dryRun })}`,
);

const jobs: { piece: PieceState; width: number }[] = [];
for (let width = 1; width <= maxSide; width++)
  for (const piece of pieces)
    if (width > piece.bound) jobs.push({ piece, width });

const scratchDir = mkdtempSync(join(tmpdir(), "exact-width-sweep-"));
let next = 0;
const lane = async (): Promise<void> => {
  for (let job = jobs[next++]; job !== undefined; job = jobs[next++]) {
    const { piece, width } = job;
    if (piece.stopped) continue;
    const started = Date.now();
    const verdict = await runExactWidth(piece.shape, width, {
      threads,
      startRow,
      scratch: join(scratchDir, `${piece.shape.id}-${width}`),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    const id = piece.shape.id;
    if (verdict.kind === "rectangle") {
      piece.stopped = true;
      log(
        `FOUND ${id} width ${width}: a ${width} x ${verdict.height} rectangle tiles (${seconds} s)`,
      );
      continue;
    }
    if (verdict.kind === "forever") {
      piece.stopped = true;
      log(
        `${id} width ${width}: the half-strip fills forever (row ${verdict.row} repeats row ${verdict.earlier}), stopping (${seconds} s)`,
      );
      continue;
    }
    log(`${id} width ${width}: dead at row ${verdict.row} (${seconds} s)`);
    piece.dead.add(width);
    const before = piece.bound;
    while (piece.dead.has(piece.bound + 1)) piece.bound++;
    if (piece.bound > before) {
      if (!dryRun)
        recordSideBound(
          store,
          piece.shape,
          piece.bound,
          "Exact searches (column searches, then exact width automata from tools/exact-width-sweep.ts)",
        );
      log(`${id}: bound ${piece.bound}${dryRun ? " (dry run)" : ""}`);
    }
  }
};
try {
  await Promise.all(Array.from({ length: jobCount }, lane));
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}
log(`# done ${pieces.map((p) => `${p.shape.id}: ${p.bound}`).join(", ")}`);
