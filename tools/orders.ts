import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { ensureNativeTiler } from "./lib/native-tiler";
import { searchOrder } from "./lib/order-search";
import { DATA_DIR, DataStore, printHelpIfAsked } from "./lib/store";

const USAGE = `Fills order, smallestRectangles and rectifiable for pieces that have a stored tiling
but no recorded order.

Usage: npx tsx tools/orders.ts [--budget <nodes>] [--only <ids>] [--dry-run]

  --budget <nodes>  native node budget per rectangle (default 2000000000)
  --only <ids>      comma-separated IDs

For k = 2, 3, ... copies, every rectangle of area k * size that holds a copy is searched to the
end with the exact native tiler. The first k with a tiling is the order; its tiled rectangles are
the smallest rectangles, and their tilings are stored. A piece is skipped if any rectangle
below the stored tiling's copy count stays undecided.`;

const SOURCE_REF = "site-solver";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const budget = Number(argument("--budget", "2000000000"));
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
if (!Number.isInteger(budget) || budget < 1)
  throw new Error("--budget must be a positive integer");

const store = new DataStore();
const targets: { shape: Polyomino; maxCopies: number }[] = [];
for (const size of readdirSync(join(DATA_DIR, "polyominoes")))
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
    if (only.size > 0 && !only.has(shape.id)) continue;
    if (shape.isRectangle()) continue;
    if (store.entry(shape).properties.order !== undefined) continue;
    const directory = join(DATA_DIR, "tilings", shape.id);
    if (!existsSync(directory)) continue;
    const copies = readdirSync(directory).map((name) => {
      const match = /^(\d+)x(\d+)/.exec(name);
      if (match === null) throw new Error(`bad tiling file ${name}`);
      return (Number(match[1]) * Number(match[2])) / shape.size;
    });
    targets.push({ shape, maxCopies: Math.min(...copies) });
  }
console.log(
  `${targets.length} pieces:`,
  targets.map((t) => `${t.shape.id} (<= ${t.maxCopies})`).join(", "),
);
if (dryRun) process.exit(0);
ensureNativeTiler();

for (const { shape, maxCopies } of targets) {
  const settled = await searchOrder(shape, maxCopies, budget);
  if (settled.kind !== "settled") {
    console.log(
      `${shape.id}: ${settled.kind === "undecided" ? "undecided, skipped" : "no order found below the stored tiling"}`,
    );
    continue;
  }
  const { copies, found } = settled;
  for (const [[a, b], placements] of found) {
    // The tiler returns the long side as width.
    store.writeTiling(shape, {
      width: b,
      height: a,
      placements,
      ref: SOURCE_REF,
      note: `Smallest rectangle, found by tools/orders.ts (exhaustive native search).`,
    });
  }
  const searched =
    "every rectangle holding fewer copies was ruled out by exhaustive search";
  const records: [string, PropertyRecord<unknown>][] = [
    [
      "rectifiable",
      {
        status: "computed",
        value: true,
        ref: SOURCE_REF,
        reason: `A stored tiling covers a ${found[0]?.[0][0]} x ${found[0]?.[0][1]} rectangle.`,
      },
    ],
    [
      "order",
      {
        status: "computed",
        value: copies,
        ref: SOURCE_REF,
        reason: `A stored tiling uses ${copies} copies, and ${searched}.`,
      },
    ],
    [
      "smallestRectangles",
      {
        status: "computed",
        value: found.map(([size]) => size),
        ref: SOURCE_REF,
        reason: `Every rectangle holding ${copies} copies was searched to the end.`,
      },
    ],
  ];
  for (const [key, record] of records)
    store.setProperty(shape, key as never, record, "orders");
  store.save();
  console.log(
    `${shape.id}: order ${copies}, smallest ${JSON.stringify(found.map(([s]) => s))}`,
  );
}
