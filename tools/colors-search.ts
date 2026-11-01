import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Polyomino } from "../src/core/polyomino";
import { tileRectangle } from "../src/core/solver";
import { DATA_DIR, DataStore, printHelpIfAsked } from "./lib/store";

const USAGE = `Searches for rectangle tilings that need fewer colors than the best known one.

Usage: npx tsx tools/colors-search.ts [--max-factor <f>] [--budget <steps>]

  --max-factor  try rectangles holding up to f times the order in copies (default 4)
  --budget      step budget of one rectangle search (default 20000000)

For each piece whose fewest colors is open with an upper bound u, rectangles in order of area are
searched for a tiling whose copies can be colored with u - 1 colors (copies sharing an edge differ).
A 2-colorable tiling settles the value at 2; otherwise the bound is tightened. Tilings are stored.`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const maxFactor = Number(argument("--max-factor", "4"));
const budget = Number(argument("--budget", "20000000"));
if (
  !Number.isInteger(maxFactor) ||
  maxFactor < 1 ||
  !Number.isInteger(budget) ||
  budget < 1
)
  throw new Error("--max-factor and --budget must be positive integers");

const store = new DataStore();
for (const size of readdirSync(join(DATA_DIR, "polyominoes"))) {
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
    const properties = store.entry(shape).properties;
    const colors = properties.minColors;
    const order = properties.order?.value as number | undefined;
    if (
      colors?.status !== "open" ||
      colors.upper === undefined ||
      order === undefined
    )
      continue;
    let best = colors.upper;
    const minSide = Math.min(shape.width, shape.height);
    search: for (let limit = best - 1; limit >= 2; limit--) {
      for (let copies = order; copies <= maxFactor * order; copies++) {
        const area = copies * shape.size;
        for (let width = minSide; width * width <= area; width++) {
          if (area % width !== 0) continue;
          const result = tileRectangle(
            shape,
            width,
            area / width,
            budget,
            limit,
          );
          if (result.kind !== "found") continue;
          best = limit;
          store.writeTiling(
            shape,
            {
              width,
              height: area / width,
              placements: result.value,
              ref: "site-solver",
              note: `A tiling whose copies can be colored with ${limit} colors (tools/colors-search.ts).`,
            },
            `${limit}colors`,
          );
          console.log(
            `${shape.id}: ${limit}-colorable ${width}x${area / width}`,
          );
          continue search;
        }
      }
      break;
    }
    if (best === colors.upper) {
      console.log(`${shape.id}: nothing better than ${best}`);
      continue;
    }
    store.replaceOpen(
      shape,
      "minColors",
      best === 2
        ? {
            status: "computed",
            value: 2,
            ref: "site-solver",
            reason:
              "A stored tiling is 2-colorable, and two copies of a non-rectangular piece always touch.",
          }
        : {
            status: "open",
            upper: best,
            note: `Upper bound from a stored ${best}-colorable tiling.`,
          },
    );
  }
}
console.log(store.save());
