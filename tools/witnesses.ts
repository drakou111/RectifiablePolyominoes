import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { PrimeRectangles } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import {
  runWitnessJobNative,
  runWitnessJobSat,
  type NativeWitnessSettings,
  type WitnessJob,
  type WitnessOutcome,
  type WitnessParameters,
} from "./lib/witness-job";
import { ensureNativeTiler } from "./lib/native-tiler";
import { runPool } from "./lib/pool";
import {
  DATA_DIR,
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
} from "./lib/store";

const USAGE = `Stores a tiling for every property that names a rectangle but has no picture yet.

Usage: npx tsx tools/witnesses.ts [options]

  --engine <name>    native (default): the C++ frontier tiler in tools/cpp, built on first use;
                     sat: CaDiCaL through tools/sat/sat_tiler.py (needs uv), strong on rectangles
                     whose short side is 25 or more; js: exact cover in worker threads
  --kinds <list>     any of square,odd,prime (default all)
  --max-area <n>     skip rectangles larger than n cells (default: none for native, 40000 for
                     sat and 5000 for js, which build every placement up front)
  --min-area <n>     skip rectangles smaller than n cells, e.g. to resume a run (default 1)
  --seconds <s>      sat: solver time limit per rectangle (default 120)
  --budget <steps>   step (js) or node (native) budget of one rectangle search (default 20000000)
  --seeds <a-b>      native: restart seeds, each with the full budget (default 1-4)
  --cache-mb <m>     native: failed-state cache per process in MB (default 256)
  --pocket-limit <p> native: reject moves that leave an empty pocket under p cells (default 2)
  --workers <n>      parallel searches (default: all cores)
  --only <ids>       comma-separated IDs
  --dry-run          list the jobs only

Squares and prime rectangles have known sizes; an odd tiling tries every rectangle holding the
odd order's number of copies. Jobs run smallest first and each tiling is written as soon as it is
found. Existing tiling files are never overwritten. Progress goes to output/witnesses/run.log.`;

const ENGINES = ["native", "sat", "js"] as const;
const MAX_AREA: Record<(typeof ENGINES)[number], number> = {
  native: Number.MAX_SAFE_INTEGER,
  sat: 40_000,
  js: 5000,
};
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
const engine = argument("--engine", "native");
if (!(ENGINES as readonly string[]).includes(engine))
  throw new Error(`unknown engine "${engine}"; use ${ENGINES.join(", ")}`);
const maxArea = Number(
  argument("--max-area", String(MAX_AREA[engine as (typeof ENGINES)[number]])),
);
const minArea = Number(argument("--min-area", "1"));
const seedRange = /^(\d+)-(\d+)$/.exec(argument("--seeds", "1-4"));
if (seedRange === null) throw new Error("--seeds must look like 1-4");
const seeds: number[] = [];
for (let seed = Number(seedRange[1]); seed <= Number(seedRange[2]); seed++)
  seeds.push(seed);
if (seeds.length === 0) throw new Error("--seeds range is empty");
const parameters: WitnessParameters = {
  stepBudget: Number(argument("--budget", "20000000")),
};
const workerCount = Number(
  argument("--workers", String(availableParallelism())),
);
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const nativeSettings: NativeWitnessSettings = {
  budget: parameters.stepBudget,
  cacheMegabytes: Number(argument("--cache-mb", "256")),
  pocketLimit: Number(argument("--pocket-limit", "2")),
  seeds,
};
const satSettings = { seconds: Number(argument("--seconds", "120")) };
for (const value of [
  satSettings.seconds,
  workerCount,
  parameters.stepBudget,
  maxArea,
  minArea,
  nativeSettings.cacheMegabytes,
  nativeSettings.pocketLimit,
])
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
      const fitting = rectangles.filter(
        ([a, b]) => a * b >= minArea && a * b <= maxArea,
      );
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
const runParameters =
  engine === "js"
    ? { engine, ...parameters, maxArea }
    : engine === "sat"
      ? { engine, ...satSettings, maxArea }
      : { engine, ...nativeSettings, maxArea };
console.log(`${jobs.length} jobs`, counts, runParameters);
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
  `\n# ${new Date().toISOString()} ${jobs.length} jobs ${JSON.stringify(runParameters)}\n`,
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

if (engine === "js")
  await runPool<WitnessJob, WitnessOutcome>(
    new URL("./lib/witness-worker-bootstrap.mjs", import.meta.url),
    parameters,
    jobs,
    workerCount,
    50,
    record,
  );
else {
  if (engine === "native") ensureNativeTiler();
  let next = 0;
  let done = 0;
  const lane = async (): Promise<void> => {
    for (let job = jobs[next++]; job !== undefined; job = jobs[next++]) {
      record(
        await (engine === "sat"
          ? runWitnessJobSat(job, satSettings)
          : runWitnessJobNative(job, nativeSettings)),
      );
      if (++done % 25 === 0) console.log(`${done}/${jobs.length} done`, tally);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, lane));
}
console.log("done", tally);
appendFileSync(logPath, `# done ${JSON.stringify(tally)}\n`);
