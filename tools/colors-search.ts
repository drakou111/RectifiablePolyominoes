import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Polyomino } from "../src/core/polyomino";
import type {
  ColorsJob,
  ColorsOutcome,
  ColorsParameters,
} from "./lib/colors-job";
import { runPool } from "./lib/pool";
import { DATA_DIR, DataStore, printHelpIfAsked } from "./lib/store";

const USAGE = `Searches for rectangle tilings that need fewer colors than the best known one.

Usage: npx tsx tools/colors-search.ts [options]

  --max-factor <f>   try rectangles holding up to f times the order in copies (default 4)
  --max-copies <k>   but never more than k copies (default 120)
  --budget <steps>   step budget of one rectangle search (default 20000000)
  --workers <n>      worker threads (default: all cores)
  --only <ids>       comma-separated IDs
  --dry-run          report only

For each piece whose fewest colors is open with an upper bound u, rectangles in order of area are
searched for a tiling whose copies can be colored with u - 1 colors (copies sharing an edge differ).
A 2-colorable tiling settles the value at 2; otherwise the bound is tightened. Each piece is saved
as soon as its search finishes, and its tilings are stored.`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const parameters: ColorsParameters = {
  maxFactor: Number(argument("--max-factor", "4")),
  maxCopies: Number(argument("--max-copies", "120")),
  stepBudget: Number(argument("--budget", "20000000")),
};
const workerCount = Number(
  argument("--workers", String(availableParallelism())),
);
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
for (const value of [workerCount, ...Object.values(parameters)])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`numeric options must be positive integers, got ${value}`);

const store = new DataStore();
const jobs: ColorsJob[] = [];
for (const size of readdirSync(join(DATA_DIR, "polyominoes"))) {
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
    if (only.size > 0 && !only.has(shape.id)) continue;
    const properties = store.entry(shape).properties;
    const colors = properties.minColors;
    const order = properties.order?.value as number | undefined;
    if (
      colors?.status !== "open" ||
      colors.upper === undefined ||
      order === undefined ||
      colors.upper <= 2
    )
      continue;
    jobs.push({ id: shape.id, order, upper: colors.upper });
  }
}
// Small orders first: they finish quickly and are the likeliest to improve.
jobs.sort((a, b) => a.order - b.order);
console.log(`${jobs.length} pieces`, parameters);

const record = (outcome: ColorsOutcome): void => {
  const seconds = (outcome.milliseconds / 1000).toFixed(0);
  const best = outcome.tilings.at(-1);
  if (best === undefined) {
    console.log(`${outcome.id}: nothing better (${seconds} s)`);
    return;
  }
  console.log(
    `${outcome.id}: ${best.limit}-colorable ${best.width}x${best.height} (${seconds} s)`,
  );
  if (dryRun) return;
  const shape = Polyomino.fromId(outcome.id);
  for (const tiling of outcome.tilings)
    store.writeTiling(
      shape,
      {
        width: tiling.width,
        height: tiling.height,
        placements: tiling.placements,
        ref: "site-solver",
        note: `A tiling whose copies can be colored with ${tiling.limit} colors (tools/colors-search.ts).`,
      },
      `${tiling.limit}colors`,
    );
  store.replaceOpen(
    shape,
    "minColors",
    best.limit === 2
      ? {
          status: "computed",
          value: 2,
          ref: "site-solver",
          reason:
            "A stored tiling is 2-colorable, and two copies of a non-rectangular piece always touch.",
        }
      : {
          status: "open",
          upper: best.limit,
          note: `Upper bound from a stored ${best.limit}-colorable tiling.`,
        },
  );
  store.save();
};

await runPool<ColorsJob, ColorsOutcome>(
  new URL("./lib/colors-worker-bootstrap.mjs", import.meta.url),
  parameters,
  jobs,
  workerCount,
  1,
  record,
);
console.log(dryRun ? "dry run, nothing written" : "done");
