import { enumerateFreePolyominoes } from "../src/core/enumerate";
import { DataStore, printHelpIfAsked, reportConflicts } from "./lib/store";

const USAGE = `Applies Dahlke's Gun Theorem to undecided polyominoes of width 2.

Usage: npx tsx tools/apply-gun-theorem.ts [--max-size <n>]

  --max-size  largest piece size to consider (default 10)

The Gun Theorem (github.com/eklhad/trec, theorems/gun) classifies the polyominoes of width 2:
apart from pieces of order 2 or 4, only f040 (order 10), f840 (92) and f860 (76) tile
rectangles, and fe70 is unresolved. Run tools/solve.ts first: every width-2 piece it could not
settle has no rectangle with at most 10 copies, so it is none of the exceptions. fe70 and pieces
with any recorded rectifiability are left alone.`;

const EXCEPTIONS = new Set(["f040", "f840", "f860", "fe70"]);

printHelpIfAsked(USAGE);
const index = process.argv.indexOf("--max-size");
const maxSize = index === -1 ? 10 : Number(process.argv[index + 1]);
if (!Number.isInteger(maxSize) || maxSize < 1)
  throw new Error("--max-size must be a positive integer");

const store = new DataStore();
const applied: string[] = [];
for (const shape of enumerateFreePolyominoes(maxSize).flat()) {
  if (shape.height !== 2 || shape.isRectangle() || EXCEPTIONS.has(shape.id))
    continue;
  if (store.hasProperty(shape, "rectifiable")) continue;
  store.setProperty(
    shape,
    "rectifiable",
    {
      status: "proven",
      value: false,
      ref: "dahlke-gun",
      refDetail: "sections 1-25",
      reason:
        "Dahlke's Gun Theorem: apart from pieces of order 2 or 4, the only width-2 polyominoes that tile rectangles are f040, f840 and f860 (fe70 is open). This piece is none of them.",
      note: "The catalogue's exhaustive search agrees as far as it reaches: no rectangle holds 10 or fewer copies.",
    },
    "gun theorem",
  );
  applied.push(shape.id);
}
console.log(
  `applied to ${applied.length}: ${applied.join(", ")}`,
  store.save(),
);
reportConflicts(store.conflicts);
