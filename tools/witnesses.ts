import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { PrimeRectangles } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import type {
  WitnessJob,
  WitnessOutcome,
  WitnessParameters,
} from "./lib/witness-job";
import { runPool } from "./lib/pool";
import {
  DATA_DIR,
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
} from "./lib/store";

const USAGE = `Stores a tiling for every property that names a rectangle but has no picture yet.

Usage: npx tsx tools/witnesses.ts [options]

  --kinds <list>     any of square,odd,prime (default all)
  --max-area <n>     skip rectangles larger than n cells (default no limit)
  --budget <steps>   step budget of one rectangle search (default 20000000)
  --workers <n>      worker threads (default: all cores)
  --only <ids>       comma-separated IDs
  --dry-run          list the jobs only

Squares and prime rectangles have known sizes; an odd tiling tries every rectangle holding the
odd order's number of copies. Jobs run smallest first and each tiling is written as soon as it is
found. Existing tiling files are never overwritten. Progress goes to output/witnesses/run.log.`;

const ALL_KINDS = ["square", "odd", "prime"] as const;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const kinds = new Set(argument("--kinds", ALL_KINDS.join(",")).split(","));
for (const kind of kinds)
  if (!(ALL_KINDS as readonly string[]).includes(kind))
    throw new Error(`unknown kind "${kind}"; use ${ALL_KINDS.join(", ")}`);
const maxArea = Number(argument("--max-area", String(Number.MAX_SAFE_INTEGER)));
const parameters: WitnessParameters = {
  stepBudget: Number(argument("--budget", "20000000")),
};
const workerCount = Number(
  argument("--workers", String(availableParallelism())),
);
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
for (const value of [workerCount, parameters.stepBudget, maxArea])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`numeric options must be positive integers, got ${value}`);

const sizeKey = (a: number, b: number): string =>
  `${Math.min(a, b)}x${Math.max(a, b)}`;

const store = new DataStore();
const jobs: WitnessJob[] = [];
for (const size of readdirSync(join(DATA_DIR, "polyominoes"))) {
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
    if (only.size > 0 && !only.has(shape.id)) continue;
    if (shape.isRectangle()) continue;
    const properties = store.entry(shape).properties;
    const tilingDir = join(DATA_DIR, "tilings", shape.id);
    const stored = existsSync(tilingDir) ? readdirSync(tilingDir) : [];
    const storedSizes = new Set(
      stored.map((name) => {
        const match = /^(\d+)x(\d+)/.exec(name);
        if (match === null) throw new Error(`bad tiling file ${name}`);
        return sizeKey(Number(match[1]), Number(match[2]));
      }),
    );
    const has = (a: number, b: number): boolean =>
      storedSizes.has(sizeKey(a, b));
    const push = (
      kind: WitnessJob["kind"],
      rectangles: [number, number][],
    ): void => {
      const fitting = rectangles.filter(([a, b]) => a * b <= maxArea);
      if (fitting.length > 0)
        jobs.push({ id: shape.id, kind, rectangles: fitting });
    };

    const square = properties.smallestSquare?.value;
    if (
      kinds.has("square") &&
      typeof square === "number" &&
      !has(square, square)
    )
      push("square", [[square, square]]);

    const odd = properties.oddOrder?.value;
    const order = properties.order?.value;
    if (
      kinds.has("odd") &&
      typeof odd === "number" &&
      odd !== order &&
      !stored.some((name) => name.includes("-odd"))
    ) {
      const area = odd * shape.size;
      const minSide = Math.min(shape.width, shape.height);
      const candidates: [number, number][] = [];
      for (let side = minSide; side * side <= area; side++)
        if (area % side === 0 && !has(side, area / side))
          candidates.push([side, area / side]);
      push("odd", candidates);
    }

    const primes =
      (properties.primeRectangles?.value as PrimeRectangles | undefined)
        ?.rectangles ?? [];
    if (kinds.has("prime"))
      for (const [a, b] of primes) if (!has(a, b)) push("prime", [[a, b]]);
  }
}
const area = (job: WitnessJob): number =>
  Math.min(...job.rectangles.map(([a, b]) => a * b));
jobs.sort((x, y) => area(x) - area(y));
const counts = { square: 0, odd: 0, prime: 0 };
for (const job of jobs) counts[job.kind]++;
console.log(`${jobs.length} jobs`, counts, parameters);
if (dryRun) {
  for (const job of jobs)
    console.log(job.id, job.kind, JSON.stringify(job.rectangles));
  process.exit(0);
}

const logDir = join(PROJECT_ROOT, "output", "witnesses");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, "run.log");
appendFileSync(
  logPath,
  `\n# ${new Date().toISOString()} ${process.argv.slice(2).join(" ")}\n`,
);
const tally = { found: 0, budget: 0, impossible: 0 };
const NOTES: Record<WitnessJob["kind"], string> = {
  square: "Smallest square, found by exact-cover search (tools/witnesses.ts).",
  odd: "Smallest odd tiling, found by exact-cover search (tools/witnesses.ts).",
  prime: "Prime rectangle, found by exact-cover search (tools/witnesses.ts).",
};

const record = (outcome: WitnessOutcome): void => {
  const { job } = outcome;
  tally[outcome.kind]++;
  const seconds = (outcome.milliseconds / 1000).toFixed(1);
  let line = `${job.id} ${job.kind} ${JSON.stringify(job.rectangles)}: ${outcome.kind} (${seconds} s)`;
  if (outcome.kind === "found") {
    const written = store.writeTiling(
      Polyomino.fromId(job.id),
      {
        width: outcome.width,
        height: outcome.height,
        placements: outcome.placements,
        ref: "site-solver",
        note: NOTES[job.kind],
      },
      job.kind === "odd" ? "odd" : undefined,
    );
    line += written === undefined ? " (file existed)" : ` -> ${written}`;
  }
  if (outcome.kind === "impossible")
    line = `CONTRADICTION: ${line}; the data says this rectangle tiles`;
  appendFileSync(logPath, `${line}\n`);
  if (outcome.kind !== "budget") console.log(line);
};

await runPool<WitnessJob, WitnessOutcome>(
  new URL("./lib/witness-worker-bootstrap.mjs", import.meta.url),
  parameters,
  jobs,
  workerCount,
  50,
  record,
);
console.log("done", tally);
appendFileSync(logPath, `# done ${JSON.stringify(tally)}\n`);
