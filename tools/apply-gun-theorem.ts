import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { PolyominoEntry } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { appendToRecord, recordPath } from "./lib/record";
import { DATA_DIR, printHelpIfAsked } from "./lib/store";

const USAGE = `Applies Dahlke's Gun Theorem to the open polyominoes of width 2.

Usage: npx tsx tools/apply-gun-theorem.ts [--dry-run]

The Gun Theorem (github.com/eklhad/trec, theorems/gun) classifies the polyominoes of width 2:
apart from pieces of order 2 or 4, only f040 (order 10), f840 (92) and f860 (76) tile
rectangles, and fe70 is unresolved. An open width-2 entry whose order lower bound is above 4
(every rectangle with at most 4 copies ruled out by search) is none of the exceptions, so it
tiles no rectangle: it is added to output/classification/<n>.txt and its entry leaves data/.`;

const EXCEPTIONS = new Set(["f040", "f840", "f860", "fe70"]);
/** Orders the theorem allows besides the exceptions. */
const LARGEST_ALLOWED_ORDER = 4;
const REASON =
  "Dahlke's Gun Theorem (github.com/eklhad/trec, theorems/gun): apart from pieces of order 2 or 4, the only width-2 polyominoes that tile rectangles are f040, f840 and f860 (fe70 is open). This piece is none of them, and exhaustive search rules out orders 2 and 4.";

printHelpIfAsked(USAGE);
const dryRun = process.argv.includes("--dry-run");

const bySize = new Map<number, string[]>();
const folder = join(DATA_DIR, "polyominoes");
for (const sizeFolder of readdirSync(folder))
  for (const file of readdirSync(join(folder, sizeFolder))) {
    const entry = JSON.parse(
      readFileSync(join(folder, sizeFolder, file), "utf8"),
    ) as PolyominoEntry;
    const shape = Polyomino.fromId(entry.id);
    if (shape.height !== 2 || shape.isRectangle() || EXCEPTIONS.has(shape.id))
      continue;
    if (entry.properties.rectifiable?.status !== "open") continue;
    const lower = entry.properties.order?.lower;
    if (lower === undefined || lower <= LARGEST_ALLOWED_ORDER) {
      console.log(
        `${shape.id}: open, but no search rules out orders up to 4; left alone`,
      );
      continue;
    }
    if (existsSync(join(DATA_DIR, "tilings", shape.id)))
      throw new Error(`${shape.id} is open but has stored tilings`);
    bySize.set(shape.size, [...(bySize.get(shape.size) ?? []), shape.id]);
  }

for (const [size, ids] of [...bySize].sort((a, b) => a[0] - b[0])) {
  console.log(`size ${size}: ${ids.length} ruled out: ${ids.join(" ")}`);
  if (dryRun) continue;
  await appendToRecord(recordPath(size), REASON, ids);
  for (const id of ids) rmSync(join(folder, String(size), `${id}.json`));
}
if (dryRun) console.log("dry run, nothing written");
