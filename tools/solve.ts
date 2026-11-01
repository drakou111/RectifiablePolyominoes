import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import {
  DATA_DIR,
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";
import type { SolveJob, SolveOutcome, SolveParameters } from "./lib/solve-job";

const USAGE = `Settles easy cases by exhaustive search and writes the results to data/.

Usage: npx tsx tools/solve.ts [options]

  --min-size <n>     smallest piece size to process (default 7)
  --max-size <n>     largest piece size to process (default 10)
  --max-copies <k>   try every rectangle holding up to k copies (default 10)
  --depths <list>    corner region depths to try, e.g. 6,8 (default 6,8)
  --budget <steps>   step budget per single search (default 2000000)
  --workers <n>      worker threads (default: all cores)
  --verify           compare with existing data instead of writing; reports disagreements
  --dry-run          compute and report, write nothing

Only empty properties are filled, and only from searches that finished. A search that hits its
budget proves nothing and is listed as undecided. Results: status "computed", ref site-solver.
A run summary is saved to output/solve/.`;

const SOURCE_REF = "site-solver";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const minSize = Number(argument("--min-size", "7"));
const maxSize = Number(argument("--max-size", "10"));
const verify = process.argv.includes("--verify");
const dryRun = process.argv.includes("--dry-run") || verify;
const parameters: SolveParameters = {
  maxCopies: Number(argument("--max-copies", "10")),
  depths: argument("--depths", "6,8").split(",").map(Number),
  stepBudget: Number(argument("--budget", "2000000")),
};
const workerCount = Number(
  argument("--workers", String(availableParallelism())),
);
for (const [name, value] of Object.entries({
  minSize,
  maxSize,
  workerCount,
  ...parameters,
}))
  if (
    Array.isArray(value)
      ? value.some((v) => !Number.isInteger(v) || v < 1)
      : !Number.isInteger(value) || (value as number) < 1
  )
    throw new Error(
      `--${name} must be a positive integer, got ${String(value)}`,
    );

const store = new DataStore();
const jobs: SolveJob[] = [];
for (const shape of enumerateFreePolyominoes(maxSize).flat()) {
  if (shape.size < minSize || shape.hasHole() || shape.isRectangle()) continue;
  const entry = store.entry(shape);
  const rectifiable = entry.properties.rectifiable?.value;
  const order = entry.properties.order;
  const smallest = (entry.properties.smallestRectangles?.value ?? []) as [
    number,
    number,
  ][];
  const hasTilings = existsSync(join(DATA_DIR, "tilings", shape.id));
  if (verify) {
    jobs.push({
      id: shape.id,
      searchOrder: true,
      testCorner: true,
      tileSizes: [],
    });
    continue;
  }
  // Search when the order is unknown, or known and small but missing its rectangles or a tiling.
  const knownOrder = order?.value as number | undefined;
  const searchOrder =
    rectifiable !== false &&
    (order === undefined ||
      (knownOrder !== undefined &&
        knownOrder <= parameters.maxCopies &&
        (smallest.length === 0 || !hasTilings)));
  const job: SolveJob = {
    id: shape.id,
    searchOrder,
    testCorner: rectifiable === undefined,
    tileSizes: hasTilings || searchOrder ? [] : smallest,
  };
  if (job.searchOrder || job.testCorner || job.tileSizes.length > 0)
    jobs.push(job);
}

// Larger pieces with entered smallest rectangles but no tiling: search for an example tiling only.
if (!verify) {
  for (const sizeFolder of readdirSync(join(DATA_DIR, "polyominoes"))) {
    if (Number(sizeFolder) <= maxSize) continue;
    for (const file of readdirSync(join(DATA_DIR, "polyominoes", sizeFolder))) {
      const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
      if (existsSync(join(DATA_DIR, "tilings", shape.id))) continue;
      const smallest = (store.entry(shape).properties.smallestRectangles
        ?.value ?? []) as [number, number][];
      if (smallest.length > 0)
        jobs.push({
          id: shape.id,
          searchOrder: false,
          testCorner: false,
          tileSizes: smallest,
        });
    }
  }
}

const started = Date.now();
const outcomes: SolveOutcome[] = [];
await new Promise<void>((resolve, reject) => {
  let next = 0;
  let running = 0;
  const workers = Array.from(
    { length: Math.min(workerCount, jobs.length) },
    () => {
      const worker = new Worker(
        new URL("./lib/solve-worker-bootstrap.mjs", import.meta.url),
        { workerData: parameters },
      );
      const feed = (): void => {
        const job = jobs[next++];
        if (job === undefined) {
          void worker.terminate();
          if (--running === 0) resolve();
          return;
        }
        worker.postMessage(job);
      };
      worker.on("message", (outcome: SolveOutcome) => {
        outcomes.push(outcome);
        if (outcomes.length % 100 === 0 || outcomes.length === jobs.length)
          console.log(
            `${outcomes.length}/${jobs.length} done, ${((Date.now() - started) / 1000).toFixed(0)} s`,
          );
        feed();
      });
      worker.on("error", reject);
      running++;
      return { feed };
    },
  );
  if (workers.length === 0) resolve();
  for (const worker of workers) worker.feed();
});

const computed = (record: object): PropertyRecord<unknown> =>
  ({
    status: "computed",
    ref: SOURCE_REF,
    ...record,
  }) as PropertyRecord<unknown>;
const summary = {
  ordersFound: 0,
  blocked: 0,
  tilingsWritten: 0,
  undecided: [] as string[],
  disagreements: [] as string[],
};
for (const outcome of outcomes.sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const shape = Polyomino.fromId(outcome.id);
  const entry = store.entry(shape);
  const known = entry.properties;

  if (typeof outcome.order === "object") {
    summary.ordersFound++;
    const { order, smallest } = outcome.order;
    if (known.rectifiable?.value === false)
      summary.disagreements.push(
        `${outcome.id}: data says no rectangle, search found ${smallest[0]?.width}x${smallest[0]?.height}`,
      );
    if (known.order?.value !== undefined && known.order.value !== order)
      summary.disagreements.push(
        `${outcome.id}: data order ${String(known.order.value)}, search ${order}`,
      );
    if (!dryRun) {
      const reason = `Every rectangle holding fewer than ${order} copies was searched exhaustively.`;
      store.setProperty(
        shape,
        "rectifiable",
        computed({ value: true, reason: "A tiling was found." }),
        "solver",
      );
      store.setProperty(
        shape,
        "order",
        computed({ value: order, reason }),
        "solver",
      );
      store.setProperty(
        shape,
        "smallestRectangles",
        computed({
          value: smallest.map((s) => [s.width, s.height]),
          reason: `Every rectangle holding ${order} copies was searched exhaustively.`,
        }),
        "solver",
      );
      for (const tiling of smallest)
        if (
          store.writeTiling(shape, {
            ...tiling,
            ref: SOURCE_REF,
            note: "Found by exhaustive search (tools/solve.ts).",
          })
        )
          summary.tilingsWritten++;
    }
  } else if (outcome.corner.kind === "blocked") {
    summary.blocked++;
    if (known.rectifiable?.value === true)
      summary.disagreements.push(
        `${outcome.id}: data says rectifiable, corner test says blocked`,
      );
    if (!dryRun)
      store.setProperty(
        shape,
        "rectifiable",
        computed({
          value: false,
          reason: `No arrangement of copies fills the ${outcome.corner.depth} x ${outcome.corner.depth} corner region of any rectangle (exhaustive search over all rectangle sizes).`,
        }),
        "solver",
      );
  } else if (known.rectifiable === undefined) {
    summary.undecided.push(outcome.id);
  }

  if (!dryRun)
    for (const tiling of outcome.tilings)
      if (
        store.writeTiling(shape, {
          ...tiling,
          ref: SOURCE_REF,
          note: "Found by exhaustive search (tools/solve.ts) for a smallest rectangle recorded from the literature.",
        })
      )
        summary.tilingsWritten++;
}

const saved = dryRun ? "dry run, nothing written" : store.save();
const seconds = (Date.now() - started) / 1000;
console.log(
  `\n${jobs.length} pieces in ${seconds.toFixed(1)} s: ${summary.ordersFound} orders found, ${summary.blocked} blocked by the corner test, ${summary.undecided.length} undecided`,
);
console.log(saved);
if (summary.disagreements.length > 0)
  console.log(
    `\nDISAGREEMENTS (${summary.disagreements.length}):\n  ${summary.disagreements.join("\n  ")}`,
  );
reportConflicts(store.conflicts);

const outputDirectory = join(PROJECT_ROOT, "output", "solve");
mkdirSync(outputDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const slowest = [...outcomes]
  .sort((a, b) => b.milliseconds - a.milliseconds)
  .slice(0, 20)
  .map((o) => `${o.id} ${(o.milliseconds / 1000).toFixed(1)} s`);
writeFileSync(
  join(outputDirectory, `${stamp}.json`),
  JSON.stringify(
    {
      arguments: process.argv.slice(2),
      parameters,
      minSize,
      maxSize,
      seconds,
      ...summary,
      slowest,
    },
    null,
    2,
  ),
);
console.log(`summary saved to output/solve/${stamp}.json`);
