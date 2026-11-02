import { appendFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import {
  huntCandidates,
  nextRecord,
  type HuntKind,
  type HuntStep,
} from "./lib/hunt-plan";
import { tileRectangleSat } from "./lib/sat-tiler";
import {
  ensureNativeTiler,
  tileRectangleNative,
  type NativeResult,
} from "./lib/native-tiler";
import {
  DATA_DIR,
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
} from "./lib/store";

const USAGE = `Tightens open smallest-odd-tiling and smallest-square bounds with the native tiler.

Usage: npx tsx tools/hunt.ts [options]

  --kinds <list>       any of odd,square (default both)
  --budget <nodes>     native node budget of one rectangle search (default 50000000)
  --seeds <a-b>        native restart seeds per rectangle (default 1-2)
  --max-copies <n>     odd: largest copy count tried (default 2001)
  --max-side <n>       square: largest side tried (default 200)
  --piece-minutes <m>  time limit per piece and kind (default 60)
  --cache-mb <m>       failed-state cache per process in MB (default 512)
  --sat-seconds <s>    then CaDiCaL (tools/sat/sat_tiler.py, via uv) for this long per rectangle
                       up to 40000 cells; 0 skips it (default 300)
  --workers <n>        pieces searched at once (default 22)
  --only <ids>         comma-separated IDs
  --dry-run            list the plan only

For each piece whose oddOrder or smallestSquare is open, steps run upward from the lower bound:
odd copy counts k (every rectangle of area k * size that fits a copy) or square sides s (with
s * s a multiple of the size). A step whose every rectangle is searched to the end without a
tiling is ruled out; both searches are exact, so contiguous ruled-out steps raise the lower
bound. The first tiling found gives an upper bound, is stored and ends the piece. Lower equal to
upper settles the property. Each change is saved at once; progress goes to output/hunt/run.log.`;

const KINDS: readonly HuntKind[] = ["odd", "square"];

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const kinds = argument("--kinds", KINDS.join(",")).split(",") as HuntKind[];
for (const kind of kinds)
  if (!KINDS.includes(kind))
    throw new Error(`unknown kind "${kind}"; use ${KINDS.join(", ")}`);
const seedRange = /^(\d+)-(\d+)$/.exec(argument("--seeds", "1-2"));
if (seedRange === null) throw new Error("--seeds must look like 1-3");
const settings = {
  budget: Number(argument("--budget", "50000000")),
  seedFirst: Number(seedRange[1]),
  seedLast: Number(seedRange[2]),
  maxCopies: Number(argument("--max-copies", "2001")),
  maxSide: Number(argument("--max-side", "200")),
  pieceMinutes: Number(argument("--piece-minutes", "60")),
  cacheMegabytes: Number(argument("--cache-mb", "512")),
  workers: Number(argument("--workers", "22")),
};
for (const [name, value] of Object.entries(settings))
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer, got ${value}`);
if (settings.seedLast < settings.seedFirst)
  throw new Error("--seeds range is empty");
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const POCKET_LIMIT = 2;
/** SAT builds every placement up front; larger rectangles get only the native search. */
const SAT_MAX_AREA = 40_000;
const satSeconds = Number(argument("--sat-seconds", "300"));
if (!Number.isInteger(satSeconds) || satSeconds < 0)
  throw new Error("--sat-seconds must be a non-negative integer");

const PROPERTY = { odd: "oddOrder", square: "smallestSquare" } as const;

interface Task {
  readonly polyomino: Polyomino;
  readonly kind: HuntKind;
  readonly steps: HuntStep[];
}

const store = new DataStore();
const tasks: Task[] = [];
for (const size of readdirSync(join(DATA_DIR, "polyominoes")))
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const polyomino = Polyomino.fromId(file.replace(/\.json$/, ""));
    if (only.size > 0 && !only.has(polyomino.id)) continue;
    const properties = store.entry(polyomino).properties;
    if (properties.rectifiable?.value !== true) continue;
    for (const kind of kinds) {
      const record = properties[PROPERTY[kind]];
      if (record?.status !== "open" || record.lower === undefined) continue;
      const steps = huntCandidates(
        polyomino,
        kind,
        record.lower,
        record.upper,
        kind === "odd" ? settings.maxCopies : settings.maxSide,
      );
      if (steps.length > 0) tasks.push({ polyomino, kind, steps });
    }
  }
tasks.sort((a, b) => (a.steps[0]?.area ?? 0) - (b.steps[0]?.area ?? 0));
console.log(`${tasks.length} tasks`, { ...settings, satSeconds });
if (dryRun) {
  for (const task of tasks)
    console.log(
      task.polyomino.id,
      task.kind,
      task.steps
        .slice(0, 3)
        .map((s) => `${s.step}:${JSON.stringify(s.rectangles)}`)
        .join(" "),
      `... ${task.steps.length} steps`,
    );
  process.exit(0);
}

ensureNativeTiler();
const logDir = join(PROJECT_ROOT, "output", "hunt");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, "run.log");
appendFileSync(
  logPath,
  `\n# ${new Date().toISOString()} ${tasks.length} tasks ${JSON.stringify({ ...settings, satSeconds })}\n`,
);
const log = (line: string): void => {
  appendFileSync(logPath, `${line}\n`);
  console.log(line);
};

/** Native restarts first (they exhaust narrow rectangles fast), then SAT for what is left. */
async function searchRectangle(
  polyomino: Polyomino,
  a: number,
  b: number,
  deadline: number,
): Promise<NativeResult> {
  let last: NativeResult = { kind: "budget", nodes: 0 };
  for (let seed = settings.seedFirst; seed <= settings.seedLast; seed++) {
    if (Date.now() > deadline) return last;
    last = await tileRectangleNative(polyomino, a, b, {
      budget: settings.budget,
      cacheMegabytes: settings.cacheMegabytes,
      pocketLimit: POCKET_LIMIT,
      seed,
    });
    if (last.kind !== "budget") return last;
  }
  if (satSeconds === 0 || a * b > SAT_MAX_AREA || Date.now() > deadline)
    return last;
  return tileRectangleSat(polyomino, a, b, { seconds: satSeconds });
}

async function searchStep(
  polyomino: Polyomino,
  step: HuntStep,
  deadline: number,
): Promise<
  Extract<NativeResult, { kind: "found" }> | { kind: "exhausted" | "budget" }
> {
  let exhausted = 0;
  for (const [a, b] of step.rectangles) {
    const result = await searchRectangle(polyomino, a, b, deadline);
    if (result.kind === "found") return result;
    if (result.kind === "exhausted") exhausted++;
  }
  return {
    kind: exhausted === step.rectangles.length ? "exhausted" : "budget",
  };
}

async function runTask(task: Task): Promise<void> {
  const { polyomino, kind } = task;
  const key = PROPERTY[kind];
  const deadline = Date.now() + settings.pieceMinutes * 60_000;
  const ruledOut: number[] = [];
  const current = (): PropertyRecord<number | "none"> =>
    store.entry(polyomino).properties[key] as PropertyRecord<number | "none">;
  const saveLowerBound = (): void => {
    const record = nextRecord(kind, current(), ruledOut, undefined);
    if (record === current()) return;
    store.replaceOpen(polyomino, key, record);
    store.save();
    log(`${polyomino.id} ${kind}: ${JSON.stringify(record)}`);
  };
  for (const step of task.steps) {
    if (step.rectangles.length === 0) {
      ruledOut.push(step.step);
      continue;
    }
    const started = Date.now();
    const result = await searchStep(polyomino, step, deadline);
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (result.kind === "found") {
      const written = store.writeTiling(
        polyomino,
        {
          width: result.width,
          height: result.height,
          placements: result.placements,
          ref: "site-solver",
          note: `Smallest ${kind === "odd" ? "odd tiling" : "square"} found by tools/hunt.ts (native frontier search).`,
        },
        kind === "odd" ? "odd" : undefined,
      );
      const record = nextRecord(kind, current(), ruledOut, step.step);
      store.replaceOpen(polyomino, key, record);
      store.save();
      log(
        `${polyomino.id} ${kind} ${step.step}: FOUND ${result.width}x${result.height} (${seconds} s) -> ${written ?? "file existed"}; ${JSON.stringify(record)}`,
      );
      return;
    }
    log(`${polyomino.id} ${kind} ${step.step}: ${result.kind} (${seconds} s)`);
    if (result.kind === "exhausted") {
      ruledOut.push(step.step);
      saveLowerBound();
    }
    if (Date.now() > deadline) {
      log(`${polyomino.id} ${kind}: time limit`);
      return;
    }
  }
  saveLowerBound();
  log(`${polyomino.id} ${kind}: all steps tried`);
}

let next = 0;
const lane = async (): Promise<void> => {
  for (let task = tasks[next++]; task !== undefined; task = tasks[next++])
    await runTask(task);
};
await Promise.all(Array.from({ length: settings.workers }, lane));
log("# done");
