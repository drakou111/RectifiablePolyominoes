import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { CLASSIFICATION_DIR } from "../src/core/classification";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { streamFreePolyominoes } from "../src/core/stream-enumerate";
import {
  applySolveOutcome,
  newSolveSummary,
  nonTilerReason,
  SOLVER_REF,
} from "./lib/solve-apply";
import type { SolveJob, SolveOutcome, SolveParameters } from "./lib/solve-job";
import {
  DATA_DIR,
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";

const USAGE = `Classifies every free polyomino of one size: tiles a rectangle, tiles none, or undecided.

Usage: npx tsx tools/classify-size.ts --size <n> [options]

  --size <n>             piece size (required)
  --chunk <k>            pieces per checkpoint (default 20000)
  --workers <n>          worker threads (default: all cores)
  --max-copies <k>       small-order search: every rectangle with up to k copies (default 10)
  --depths <list>        corner region depths (default 6,8)
  --budget <steps>       step budget per single search (default 2000000)
  --band-height <h>      largest band height of the strip sweep (default 8)
  --max-states <n>       state limit of one strip sweep (default 2000000)
  --state-dir <dir>      checkpoints (default output/classify)
  --record-dir <dir>     where <n>.txt of non-tilers goes (default output/classification)
  --dry-run              classify and write the record, but leave data/ untouched

Pieces are streamed (constant memory) and sent to the same searches as tools/solve.ts. After each
chunk, results are appended under <state-dir>/<n>/ and the progress is saved, so a stopped run
resumes where it left off when started again with the same settings. When every piece is done:
non-tilers go to <record-dir>/<n>.txt (never into data/), tilers get entries and tilings, each
undecided piece gets an open entry, and data/sizes.json gets the size's totals.`;

/** OEIS A000105, for progress estimates only. */
const FREE_POLYOMINO_COUNTS = [
  1, 1, 2, 5, 12, 35, 108, 369, 1285, 4655, 17073, 63600, 238591, 901971,
  3426576, 13079255,
];

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`--${name} must be a positive integer, got ${value}`);
  return value;
}

printHelpIfAsked(USAGE);
const size = positiveInteger("size", Number(argument("--size", "")));
const chunkSize = positiveInteger(
  "chunk",
  Number(argument("--chunk", "20000")),
);
const workerCount = positiveInteger(
  "workers",
  Number(argument("--workers", String(availableParallelism()))),
);
const parameters: SolveParameters = {
  maxCopies: positiveInteger(
    "max-copies",
    Number(argument("--max-copies", "10")),
  ),
  depths: argument("--depths", "6,8")
    .split(",")
    .map((depth) => positiveInteger("depths", Number(depth))),
  stepBudget: positiveInteger(
    "budget",
    Number(argument("--budget", "2000000")),
  ),
  maxBandHeight: positiveInteger(
    "band-height",
    Number(argument("--band-height", "8")),
  ),
  maxStates: positiveInteger(
    "max-states",
    Number(argument("--max-states", "2000000")),
  ),
};
const dryRun = process.argv.includes("--dry-run");
const stateDirectory = join(
  resolve(PROJECT_ROOT, argument("--state-dir", join("output", "classify"))),
  String(size),
);
const recordPath = join(
  resolve(
    PROJECT_ROOT,
    argument("--record-dir", join("output", CLASSIFICATION_DIR)),
  ),
  `${size}.txt`,
);

interface Progress {
  readonly chunksDone: number;
  readonly piecesDone: number;
  readonly seconds: number;
}

const paths = {
  settings: join(stateDirectory, "settings.json"),
  progress: join(stateDirectory, "progress.json"),
  reasons: join(stateDirectory, "reasons.txt"),
  nonTilers: join(stateDirectory, "non-tilers.txt"),
  others: join(stateDirectory, "others.jsonl"),
  summary: join(stateDirectory, "summary.json"),
};

// Settings are saved with the results; a resumed run must use the same ones.
mkdirSync(stateDirectory, { recursive: true });
const settings = JSON.stringify({ size, chunkSize, parameters }, null, 2);
if (existsSync(paths.settings)) {
  if (readFileSync(paths.settings, "utf8") !== settings)
    throw new Error(
      `${paths.settings} holds different settings; resume with the same ones or use another --state-dir`,
    );
} else writeFileSync(paths.settings, settings);
let progress: Progress = existsSync(paths.progress)
  ? (JSON.parse(readFileSync(paths.progress, "utf8")) as Progress)
  : { chunksDone: 0, piecesDone: 0, seconds: 0 };
const reasons: string[] = existsSync(paths.reasons)
  ? readFileSync(paths.reasons, "utf8").split("\n").filter(Boolean)
  : [];
const reasonIndex = new Map(reasons.map((reason, i) => [reason, i]));

function saveProgress(next: Progress): void {
  const temporary = `${paths.progress}.tmp`;
  writeFileSync(temporary, JSON.stringify(next));
  renameSync(temporary, paths.progress);
  progress = next;
}

/** Appends one finished chunk's results in a single write per file, then marks it done. */
function flushChunk(outcomes: readonly SolveOutcome[]): void {
  const nonTilerLines: string[] = [];
  const otherLines: string[] = [];
  for (const outcome of outcomes) {
    const reason = nonTilerReason(outcome);
    if (reason === undefined) {
      otherLines.push(JSON.stringify(outcome));
      continue;
    }
    let index = reasonIndex.get(reason);
    if (index === undefined) {
      index = reasons.length;
      reasons.push(reason);
      reasonIndex.set(reason, index);
      appendFileSync(paths.reasons, `${reason}\n`);
    }
    nonTilerLines.push(`${outcome.id} ${index}`);
  }
  if (nonTilerLines.length > 0)
    appendFileSync(paths.nonTilers, `${nonTilerLines.join("\n")}\n`);
  if (otherLines.length > 0)
    appendFileSync(paths.others, `${otherLines.join("\n")}\n`);
}

const expectedTotal = FREE_POLYOMINO_COUNTS[size - 1];
const runStarted = Date.now();
const totals = { total: 0, withHoles: 0 };
let rectangles = 0;
const pieces = (function* (): Generator<{ index: number; id: string }> {
  let index = 0;
  for (const piece of streamFreePolyominoes(size)) {
    totals.total++;
    if (piece.hasHole) totals.withHoles++;
    if (piece.isRectangle) rectangles++;
    if (piece.hasHole || piece.isRectangle) continue;
    yield { index: index++, id: piece.id };
  }
})();
const firstIndex = progress.chunksDone * chunkSize;
console.log(
  `size ${size}: resuming at piece ${firstIndex} (chunk ${progress.chunksDone})`,
);

// Pieces are handed out in order; finished chunks are flushed strictly in order.
interface PendingChunk {
  handedOut: number;
  left: number;
  readonly outcomes: SolveOutcome[];
}
const pending = new Map<number, PendingChunk>();
let nextChunkToFlush = progress.chunksDone;
let exhausted = false;
let doneThisRun = 0;
let lastSave = Date.now();

function flushFinishedChunks(): void {
  for (;;) {
    const chunk = pending.get(nextChunkToFlush);
    if (chunk === undefined || chunk.left > 0) return;
    if (chunk.handedOut < chunkSize && !exhausted) return;
    flushChunk(chunk.outcomes);
    pending.delete(nextChunkToFlush);
    nextChunkToFlush++;
    const now = Date.now();
    saveProgress({
      chunksDone: nextChunkToFlush,
      piecesDone: progress.piecesDone + chunk.outcomes.length,
      seconds: progress.seconds + (now - lastSave) / 1000,
    });
    lastSave = now;
    const rate = doneThisRun / ((now - runStarted) / 1000);
    const estimate =
      expectedTotal === undefined
        ? ""
        : `, at most about ${((expectedTotal - progress.piecesDone) / Math.max(rate, 1) / 60).toFixed(0)} min to go`;
    console.log(
      `chunk ${nextChunkToFlush} saved: ${progress.piecesDone} pieces done, ${rate.toFixed(0)}/s${estimate}`,
    );
  }
}

function nextJob(): { index: number; id: string } | undefined {
  for (;;) {
    const next = pieces.next();
    if (next.done === true) {
      exhausted = true;
      return undefined;
    }
    if (next.value.index >= firstIndex) return next.value;
  }
}

await new Promise<void>((resolveRun, reject) => {
  let running = 0;
  const startWorker = (): void => {
    const worker = new Worker(
      new URL("./lib/solve-worker-bootstrap.mjs", import.meta.url),
      { workerData: parameters },
    );
    running++;
    let current: { index: number; id: string } | undefined;
    const feed = (): void => {
      current = nextJob();
      if (current === undefined) {
        void worker.terminate();
        if (--running === 0) resolveRun();
        return;
      }
      const chunk = Math.floor(current.index / chunkSize);
      const entry = pending.get(chunk) ?? {
        handedOut: 0,
        left: 0,
        outcomes: [],
      };
      entry.handedOut++;
      entry.left++;
      pending.set(chunk, entry);
      const job: SolveJob = {
        id: current.id,
        searchOrder: true,
        testCorner: true,
        tileSizes: [],
        testStrip: true,
      };
      worker.postMessage(job);
    };
    worker.on("message", (outcome: SolveOutcome) => {
      const chunk = Math.floor(
        (current as { index: number }).index / chunkSize,
      );
      const entry = pending.get(chunk) as PendingChunk;
      entry.outcomes.push(outcome);
      entry.left--;
      doneThisRun++;
      feed();
      flushFinishedChunks();
    });
    worker.on("error", reject);
    feed();
  };
  for (let i = 0; i < workerCount; i++) startWorker();
});
flushFinishedChunks();
if (pending.size > 0)
  throw new Error(`${pending.size} chunks still pending after the run`);

// Every piece is done: build the record and apply the rest.
const nonTilerLines = existsSync(paths.nonTilers)
  ? readFileSync(paths.nonTilers, "utf8").split("\n").filter(Boolean)
  : [];
const nonTilers = new Map<string, number>();
for (const line of nonTilerLines) {
  const [id, index] = line.split(" ");
  nonTilers.set(id as string, Number(index));
}
const others = new Map<string, SolveOutcome>();
if (existsSync(paths.others))
  for (const line of readFileSync(paths.others, "utf8").split("\n"))
    if (line !== "") {
      const outcome = JSON.parse(line) as SolveOutcome;
      others.set(outcome.id, outcome);
    }
const candidates = totals.total - totals.withHoles - rectangles;
if (nonTilers.size + others.size !== candidates)
  throw new Error(
    `${nonTilers.size} non-tilers + ${others.size} others != ${candidates} candidates; the state in ${stateDirectory} is inconsistent`,
  );

if (existsSync(recordPath))
  throw new Error(
    `${recordPath} exists already; move it away first so no record is overwritten`,
  );
// Same format as formatClassification, written without building every line object.
mkdirSync(join(recordPath, ".."), { recursive: true });
writeFileSync(
  recordPath,
  [
    `size ${size}`,
    ...reasons.map((reason, i) => `reason ${i} ${reason}`),
    ...[...nonTilers.keys()].sort().map((id) => `${id} ${nonTilers.get(id)}`),
    "",
  ].join("\n"),
);

const store = new DataStore();
const summary = newSolveSummary();
for (const outcome of [...others.values()].sort((a, b) =>
  a.id < b.id ? -1 : 1,
))
  applySolveOutcome(outcome, {
    store,
    parameters,
    summary,
    dryRun,
    toolName: "tools/classify-size.ts",
    recordNonTiler: () => {
      throw new Error(`${outcome.id}: a non-tiler among the other outcomes`);
    },
  });
if (!dryRun)
  for (const id of summary.undecided)
    store.setProperty(
      Polyomino.fromId(id),
      "rectifiable",
      {
        status: "open",
        ref: SOLVER_REF,
        note: `Not resolved by this site's first searches (corner test, wall sweep up to band height ${parameters.maxBandHeight}, every rectangle with at most ${parameters.maxCopies} copies).`,
      } as PropertyRecord<unknown>,
      "classify",
    );
const saved = dryRun ? "dry run, data/ untouched" : store.save();

if (!dryRun) {
  const sizesPath = join(DATA_DIR, "sizes.json");
  const sizes = JSON.parse(readFileSync(sizesPath, "utf8")) as {
    complete: number;
    sizes: Record<string, { total: number; withHoles: number }>;
  };
  sizes.sizes[String(size)] = { ...totals };
  if (size === sizes.complete + 1) sizes.complete = size;
  writeFileSync(sizesPath, `${JSON.stringify(sizes, null, 2)}\n`);
}

const result = {
  size,
  ...totals,
  nonTilers: nonTilers.size,
  ordersFound: summary.ordersFound,
  stripRectangles: summary.stripRectangles,
  undecided: summary.undecided,
  alreadySettled:
    others.size -
    summary.ordersFound -
    summary.stripRectangles -
    summary.undecided.length,
  disagreements: summary.disagreements,
  tilingsWritten: summary.tilingsWritten,
  seconds: progress.seconds,
  settings: JSON.parse(settings) as unknown,
};
writeFileSync(paths.summary, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `size ${size}: ${totals.total} pieces (${totals.withHoles} with holes), ${nonTilers.size} tile no rectangle, ${summary.ordersFound + summary.stripRectangles} tile one, ${summary.undecided.length} undecided, ${others.size - summary.ordersFound - summary.stripRectangles - summary.undecided.length} already settled in data/`,
);
console.log(saved);
if (summary.disagreements.length > 0) {
  console.log(`DISAGREEMENTS:\n  ${summary.disagreements.join("\n  ")}`);
  process.exitCode = 1;
}
reportConflicts(store.conflicts);
