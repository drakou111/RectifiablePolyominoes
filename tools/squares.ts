import { availableParallelism } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import type {
  SquaresJob,
  SquaresOutcome,
  SquaresParameters,
} from "./lib/squares-job";
import { runPool } from "./lib/pool";
import {
  DATA_DIR,
  DataStore,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";

const USAGE = `Fills the smallest square and the odd order of rectifiable pieces by exhaustive search.

Usage: npx tsx tools/squares.ts [options]

  --max-square-copies <k>  try squares holding up to k copies (default 60)
  --max-odd-copies <k>     try odd rectangles holding up to k copies (default 45)
  --budget <steps>         step budget of one rectangle search (default 20000000)
  --workers <n>            worker threads (default: all cores)
  --only <ids>             comma-separated IDs
  --dry-run                report only

A value is recorded only when every smaller candidate was ruled out exhaustively. When nothing
is found within the limit, a lower bound is recorded instead. Example tilings are stored.`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const parameters: SquaresParameters = {
  maxSquareCopies: Number(argument("--max-square-copies", "60")),
  maxOddCopies: Number(argument("--max-odd-copies", "45")),
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
const jobs: SquaresJob[] = [];
for (const size of readdirSync(join(DATA_DIR, "polyominoes"))) {
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
    if (only.size > 0 && !only.has(shape.id)) continue;
    const properties = store.entry(shape).properties;
    const order = properties.order?.value as number | undefined;
    if (properties.rectifiable?.value !== true || order === undefined) continue;
    const square =
      properties.smallestSquare === undefined ||
      (properties.smallestSquare.status === "open" &&
        properties.smallestSquare.value === undefined);
    const odd = properties.oddOrder === undefined;
    if (square || odd)
      jobs.push({ id: shape.id, order, findSquare: square, findOdd: odd });
  }
}
console.log(`${jobs.length} pieces`);

const outcomes = await runPool<SquaresJob, SquaresOutcome>(
  new URL("./lib/squares-worker-bootstrap.mjs", import.meta.url),
  parameters,
  jobs,
  workerCount,
  10,
);

const computed = (record: object): PropertyRecord<unknown> =>
  ({
    status: "computed",
    ref: "site-solver",
    ...record,
  }) as PropertyRecord<unknown>;
for (const outcome of outcomes.sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const shape = Polyomino.fromId(outcome.id);
  const { square, odd } = outcome;
  console.log(
    outcome.id,
    JSON.stringify({
      square: square.kind === "found" ? square.side : square,
      odd: odd.kind === "found" ? odd.copies : odd,
    }),
  );
  if (dryRun) continue;
  if (square.kind === "found") {
    store.setProperty(
      shape,
      "smallestSquare",
      computed({
        value: square.side,
        reason:
          "Every smaller square whose area is a multiple of the piece size was searched exhaustively.",
      }),
      "squares",
    );
    store.writeTiling(shape, {
      width: square.side,
      height: square.side,
      placements: square.placements,
      ref: "site-solver",
      note: "Smallest square, found by exhaustive search (tools/squares.ts).",
    });
  } else if (square.kind === "bound")
    store.setProperty(
      shape,
      "smallestSquare",
      {
        status: "open",
        lower: square.lowerSide,
        note: "Every smaller square was ruled out by exhaustive search.",
      },
      "squares",
    );
  if (odd.kind === "found") {
    store.setProperty(
      shape,
      "oddOrder",
      computed({
        value: odd.copies,
        reason:
          "Every rectangle holding fewer odd copies was searched exhaustively.",
      }),
      "squares",
    );
    if (
      !existsSync(
        join(
          DATA_DIR,
          "tilings",
          shape.id,
          `${odd.width}x${odd.height}-odd.json`,
        ),
      )
    )
      store.writeTiling(
        shape,
        {
          width: odd.width,
          height: odd.height,
          placements: odd.placements,
          ref: "site-solver",
          note: "Smallest odd tiling, found by exhaustive search (tools/squares.ts).",
        },
        "odd",
      );
  } else if (odd.kind === "bound")
    store.setProperty(
      shape,
      "oddOrder",
      {
        status: "open",
        lower: odd.lowerCopies,
        note: "Every rectangle holding fewer odd copies was ruled out by exhaustive search.",
      },
      "squares",
    );
}
console.log(dryRun ? "dry run, nothing written" : store.save());
reportConflicts(store.conflicts);
