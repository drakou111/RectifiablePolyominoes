import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { PolyominoEntry, PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { appendToRecord, recordPath } from "./lib/record";
import { nonTilerReason, SOLVER_REF } from "./lib/solve-apply";
import type { SolveJob, SolveOutcome, SolveParameters } from "./lib/solve-job";
import { runPool } from "./lib/pool";
import { DATA_DIR, DataStore, printHelpIfAsked } from "./lib/store";

const USAGE = `Runs deeper impossibility proofs on open pieces: corner test and wall sweep.

Usage: npx tsx tools/deepen-open.ts [options]

  --sizes <a-b>        piece sizes (default 14-17)
  --depths <list>      corner region depths (default 6,8,10,12)
  --band-height <h>    largest band height of the wall sweep (default 20)
  --max-states <n>     state limit of one wall sweep (default 8000000)
  --budget <steps>     step budget of one corner search (default 50000000)
  --workers <n>        worker threads (default: all cores)
  --dry-run            report only

A piece proven to tile no rectangle is added to output/classification/<n>.txt and its entry
leaves data/. A rectangle found by the wall sweep makes the piece a tiler, with its tiling stored
and the order bounded by it. Pieces neither proof settles stay as they are.`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const sizeRange = /^(\d+)-(\d+)$/.exec(argument("--sizes", "14-17"));
if (sizeRange === null) throw new Error("--sizes must look like 14-17");
const [minSize, maxSize] = [Number(sizeRange[1]), Number(sizeRange[2])];
const parameters: SolveParameters = {
  maxCopies: 0,
  depths: argument("--depths", "6,8,10,12").split(",").map(Number),
  stepBudget: Number(argument("--budget", "50000000")),
  maxBandHeight: Number(argument("--band-height", "20")),
  maxStates: Number(argument("--max-states", "8000000")),
};
for (const value of [
  minSize,
  maxSize,
  parameters.stepBudget,
  parameters.maxBandHeight,
  parameters.maxStates,
  ...parameters.depths,
])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`every option must be a positive integer, got ${value}`);
const workers = Number(argument("--workers", String(availableParallelism())));
const dryRun = process.argv.includes("--dry-run");

const folder = join(DATA_DIR, "polyominoes");
const jobs: SolveJob[] = [];
for (let size = minSize; size <= maxSize; size++) {
  const sizeFolder = join(folder, String(size));
  if (!existsSync(sizeFolder)) continue;
  for (const file of readdirSync(sizeFolder).sort()) {
    const entry = JSON.parse(
      readFileSync(join(sizeFolder, file), "utf8"),
    ) as PolyominoEntry;
    if (entry.properties.rectifiable?.status === "open")
      jobs.push({
        id: entry.id,
        searchOrder: false,
        testCorner: true,
        tileSizes: [],
        testStrip: true,
      });
  }
}
console.log(`${jobs.length} open pieces`, parameters);

const started = Date.now();
const outcomes = await runPool<SolveJob, SolveOutcome>(
  new URL("./lib/solve-worker-bootstrap.mjs", import.meta.url),
  parameters,
  jobs,
  workers,
  1,
  (outcome) =>
    console.log(
      `${outcome.id}: corner ${outcome.corner.kind}, sweep ${outcome.strip.kind} (${(outcome.milliseconds / 1000).toFixed(0)} s)`,
    ),
);

const store = new DataStore();
const ruledOut = new Map<number, Map<string, string[]>>();
const tilers: string[] = [];
for (const outcome of outcomes) {
  const shape = Polyomino.fromId(outcome.id);
  const reason = nonTilerReason(outcome);
  if (reason !== undefined) {
    const byReason = ruledOut.get(shape.size) ?? new Map<string, string[]>();
    byReason.set(reason, [...(byReason.get(reason) ?? []), shape.id]);
    ruledOut.set(shape.size, byReason);
    continue;
  }
  if (outcome.strip.kind !== "rectangle") continue;
  tilers.push(shape.id);
  if (dryRun) continue;
  const { width, height, placements } = outcome.strip;
  store.replaceOpen(shape, "rectifiable", {
    status: "computed",
    ref: SOLVER_REF,
    value: true,
    reason: `A ${width} x ${height} tiling was found.`,
  } as PropertyRecord<unknown>);
  const lower = store.entry(shape).properties.order?.lower;
  store.replaceOpen(shape, "order", {
    status: "open",
    upper: placements.length,
    ...(lower !== undefined && { lower }),
    ref: SOLVER_REF,
    note: `Upper bound from a ${width} x ${height} tiling found by the wall sweep.`,
  } as PropertyRecord<unknown>);
  store.writeTiling(shape, {
    width,
    height,
    placements,
    ref: SOLVER_REF,
    note: `Found by the wall sweep (tools/deepen-open.ts): the narrowest rectangle height that can be tiled is ${height}.`,
  });
}

let ruledOutCount = 0;
for (const [size, byReason] of [...ruledOut].sort((a, b) => a[0] - b[0]))
  for (const [reason, ids] of byReason) {
    ruledOutCount += ids.length;
    console.log(`size ${size}: ruled out ${ids.join(" ")}\n  ${reason}`);
    if (dryRun) continue;
    await appendToRecord(recordPath(size), reason, ids);
    for (const id of ids) rmSync(join(folder, String(size), `${id}.json`));
  }
console.log(
  `${((Date.now() - started) / 1000).toFixed(0)} s: ${ruledOutCount} ruled out, ${tilers.length} tilers found (${tilers.join(" ")}), ${jobs.length - ruledOutCount - tilers.length} still open`,
  dryRun ? "dry run, nothing written" : store.save(),
);
