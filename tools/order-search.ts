import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLASSIFICATION_DIR,
  parseClassification,
} from "../src/core/classification";
import { deriveProperties, inferProperties } from "../src/core/derived";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import type {
  Placement,
  Properties,
  PropertyKey,
  PropertyRecord,
  RectangleSize,
} from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { expandTiling } from "../src/core/tiling";
import {
  ensureNativeTiler,
  tileRectangleNative,
  type NativeResult,
} from "./lib/native-tiler";
import { orderRecords, type CopyStep } from "./lib/order-plan";
import { tileRectangleSat } from "./lib/sat-tiler";
import { DataStore, PROJECT_ROOT, printHelpIfAsked } from "./lib/store";

const USAGE = `Searches for the order of pieces whose rectifiability is unknown or open.

Usage: npx tsx tools/order-search.ts [options]

  --sizes <a-b>        piece sizes to scan for undecided pieces (default 11-12)
  --only <ids>         comma-separated IDs instead of scanning
  --from <k>           first copy count (default: the recorded lower bound, else 2)
  --max-copies <k>     last copy count (default 200)
  --budget <nodes>     native node budget per rectangle (default 50000000)
  --sat-seconds <s>    SAT time per rectangle the native search leaves open (default 120)
  --piece-minutes <m>  time limit per piece (default 30)
  --workers <n>        pieces at once (default 16)
  --dry-run            list the pieces only

Pieces listed in output/classification/<n>.txt (shown to tile no rectangle) are skipped; the
file must exist for every scanned size. For each copy count k, every rectangle of area k * size that holds a copy is searched: the native
tiler first, then SAT. The first count with a tiling ends the piece once all its rectangles are
decided. Rectifiable, order and smallest rectangles are written as far as the searches prove them
(tools/lib/order-plan.ts), with the tilings found. Log: output/order-search/run.log.`;

const SAT_MAX_AREA = 40_000;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const sizeRange = /^(\d+)-(\d+)$/.exec(argument("--sizes", "11-12"));
if (sizeRange === null) throw new Error("--sizes must look like 11-12");
const settings = {
  minSize: Number(sizeRange[1]),
  maxSize: Number(sizeRange[2]),
  maxCopies: Number(argument("--max-copies", "200")),
  budget: Number(argument("--budget", "50000000")),
  satSeconds: Number(argument("--sat-seconds", "120")),
  pieceMinutes: Number(argument("--piece-minutes", "30")),
  workers: Number(argument("--workers", "16")),
};
for (const [name, value] of Object.entries(settings))
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer, got ${value}`);
const fromArgument = argument("--from", "");
const only = argument("--only", "").split(",").filter(Boolean);

const store = new DataStore();
const effective = (shape: Polyomino): Properties => {
  const properties = {
    ...deriveProperties(shape),
    ...store.entry(shape).properties,
  } as Properties;
  return { ...properties, ...inferProperties(properties) };
};
/** IDs shown to tile no rectangle (removed from data/, kept in output/classification/). */
function knownNonTilers(size: number): Set<string> {
  const path = join(PROJECT_ROOT, "output", CLASSIFICATION_DIR, `${size}.txt`);
  if (!existsSync(path))
    throw new Error(
      `${path} is missing: without it every piece of size ${size} would look undecided`,
    );
  return new Set(
    parseClassification(readFileSync(path, "utf8")).lines.map(
      (line) => line.id,
    ),
  );
}

const pieces: Polyomino[] = [];
if (only.length > 0) pieces.push(...only.map((id) => Polyomino.fromId(id)));
else {
  const groups = enumerateFreePolyominoes(settings.maxSize);
  for (let size = settings.minSize; size <= settings.maxSize; size++) {
    const nonTilers = knownNonTilers(size);
    for (const shape of groups[size - 1] ?? []) {
      if (nonTilers.has(shape.id)) continue;
      const rectifiable = effective(shape).rectifiable;
      if (rectifiable === undefined || rectifiable.status === "open")
        pieces.push(shape);
    }
  }
}
console.log(`${pieces.length} pieces`, settings);
if (process.argv.includes("--dry-run")) {
  console.log(pieces.map((shape) => shape.id).join(" "));
  process.exit(0);
}

ensureNativeTiler();
const logDir = join(PROJECT_ROOT, "output", "order-search");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, "run.log");
const log = (line: string): void => {
  appendFileSync(logPath, `${line}\n`);
  console.log(line);
};
log(
  `# ${new Date().toISOString()} ${pieces.length} pieces ${JSON.stringify(settings)}`,
);

async function searchRectangle(
  shape: Polyomino,
  a: number,
  b: number,
): Promise<NativeResult> {
  let last: NativeResult = { kind: "budget", nodes: 0 };
  for (const seed of [1, 2]) {
    last = await tileRectangleNative(shape, a, b, {
      budget: settings.budget,
      cacheMegabytes: 512,
      pocketLimit: 2,
      seed,
    });
    if (last.kind !== "budget") return last;
  }
  if (a * b > SAT_MAX_AREA) return last;
  return tileRectangleSat(shape, a, b, { seconds: settings.satSeconds });
}

/** Writes a record unless a settled one is already there. */
function setRecord(
  shape: Polyomino,
  key: PropertyKey,
  record: PropertyRecord<unknown>,
): void {
  const existing = store.entry(shape).properties[key];
  if (existing === undefined) store.setProperty(shape, key, record, "orders");
  else store.replaceOpen(shape, key, record);
}

async function runPiece(shape: Polyomino): Promise<void> {
  const deadline = Date.now() + settings.pieceMinutes * 60_000;
  const recorded = store.entry(shape).properties.order?.lower;
  const first = fromArgument === "" ? (recorded ?? 2) : Number(fromArgument);
  const short = Math.min(shape.width, shape.height);
  const long = Math.max(shape.width, shape.height);
  const steps: CopyStep[] = [];
  for (let copies = first; copies <= settings.maxCopies; copies++) {
    if (Date.now() > deadline) break;
    const area = copies * shape.size;
    const found: [RectangleSize, Placement[]][] = [];
    let decided = true;
    for (let a = short; a * a <= area; a++) {
      if (area % a !== 0 || area / a < long) continue;
      const result = await searchRectangle(shape, a, area / a);
      if (result.kind === "found") {
        const problems = expandTiling(
          shape,
          result.width,
          result.height,
          result.placements,
        ).problems;
        if (problems.length > 0)
          throw new Error(`${shape.id}: invalid tiling: ${problems[0]}`);
        found.push([[a, area / a], result.placements]);
        store.writeTiling(shape, {
          width: result.width,
          height: result.height,
          placements: result.placements,
          ref: "site-solver",
          note: "Found by tools/order-search.ts.",
        });
      } else if (result.kind === "budget") decided = false;
    }
    steps.push({ copies, found, decided });
    if (found.length > 0) break;
  }
  const records = orderRecords(first, steps);
  for (const [key, record] of Object.entries(records))
    if (record !== undefined)
      setRecord(shape, key as PropertyKey, record as PropertyRecord<unknown>);
  store.save();
  log(`${shape.id}: ${JSON.stringify(records.order)}`);
}

let next = 0;
const lane = async (): Promise<void> => {
  for (let shape = pieces[next++]; shape !== undefined; shape = pieces[next++])
    await runPiece(shape);
};
await Promise.all(Array.from({ length: settings.workers }, lane));
log("# done");
