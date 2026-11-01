import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { minimumColoring } from "../src/core/coloring";
import type { TilingFile } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { expandTiling, pieceAdjacency } from "../src/core/tiling";
import {
  DATA_DIR,
  DataStore,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";

const USAGE = `Fills the fewest-colors property from the stored tilings.

Usage: npx tsx tools/colors.ts [--budget <steps>]

  --budget  step budget of the exact coloring search per tiling (default 20000000)

Each stored tiling is colored exactly. If some tiling needs 2 colors, the piece's value is 2
(two copies of a non-rectangular piece always touch). Otherwise the property is recorded as
open with the best tiling's count as an upper bound. Existing values are never overwritten.`;

const LOWER_BOUND_FOR_NON_RECTANGLES = 2;

printHelpIfAsked(USAGE);
const budgetIndex = process.argv.indexOf("--budget");
const budget =
  budgetIndex === -1 ? 20_000_000 : Number(process.argv[budgetIndex + 1]);
if (!Number.isInteger(budget) || budget < 1)
  throw new Error("--budget must be a positive integer");

const store = new DataStore();
let exactCount = 0;
let inexact = 0;
const tilingsDirectory = join(DATA_DIR, "tilings");
for (const id of readdirSync(tilingsDirectory)) {
  const polyomino = Polyomino.fromId(id);
  if (polyomino.isRectangle()) continue;
  let best = Infinity;
  let bestFile = "";
  for (const file of readdirSync(join(tilingsDirectory, id))) {
    const tiling = JSON.parse(
      readFileSync(join(tilingsDirectory, id, file), "utf8"),
    ) as TilingFile;
    const expanded = expandTiling(
      polyomino,
      tiling.width,
      tiling.height,
      tiling.placements,
    );
    if (expanded.problems.length > 0)
      throw new Error(`${id}/${file}: ${expanded.problems.join("; ")}`);
    const coloring = minimumColoring(
      pieceAdjacency(expanded, tiling.placements.length),
      budget,
    );
    if (coloring.exact) exactCount++;
    else inexact++;
    if (coloring.colorCount < best) {
      best = coloring.colorCount;
      bestFile = file;
    }
  }
  const tilingName = `the stored ${bestFile.replace(/\.json$/, "")} tiling`;
  if (best === LOWER_BOUND_FOR_NON_RECTANGLES)
    store.setProperty(
      polyomino,
      "minColors",
      {
        status: "computed",
        value: 2,
        ref: "site-solver",
        reason: `${tilingName.charAt(0).toUpperCase()}${tilingName.slice(1)} is 2-colorable, and two copies of a non-rectangular piece always touch.`,
      },
      "colors",
    );
  else
    store.setProperty(
      polyomino,
      "minColors",
      { status: "open", upper: best, note: `Upper bound from ${tilingName}.` },
      "colors",
    );
}
console.log(
  `colored ${exactCount} tilings exactly, ${inexact} only approximately`,
  store.save(),
);
reportConflicts(store.conflicts);
