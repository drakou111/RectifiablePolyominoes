import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PropertyRecord } from "../src/core/model";
import { BAR_FAMILY_NOTE, barPiece, barTiling } from "./lib/bar-family";
import { SOLVER_REF } from "./lib/solve-apply";
import { DATA_DIR, DataStore, printHelpIfAsked } from "./lib/store";

const USAGE = `Adds bar pieces (a row of n cells on a row of n + 1, one cell under the left end) to data/.

Usage: npx tsx tools/bar-family.ts --n <list> [--dry-run]

  --n <list>   comma-separated bar lengths, e.g. 5,9,13,21
  --dry-run    report only

For n = 1 (mod 4) the piece is entered as tiling a 2(n+1) x (n+3) rectangle with n + 3 copies,
which bounds its order, and that tiling is stored unless the piece already has one. Every listed
piece that has an entry gets the family note. Other n without an entry are skipped.`;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

printHelpIfAsked(USAGE);
const list = argument("--n");
if (list === undefined) throw new Error("--n is required, e.g. --n 5,9,13");
const lengths = list.split(",").map(Number);
const dryRun = process.argv.includes("--dry-run");

const store = new DataStore();
for (const n of lengths) {
  const shape = barPiece(n);
  const hasEntry = existsSync(store.entryPath(shape));
  if (n % 4 !== 1) {
    if (!hasEntry) {
      console.log(`n=${n} ${shape.id}: no entry and no construction, skipped`);
      continue;
    }
    console.log(
      `n=${n} ${shape.id}: ${store.setNote(shape, BAR_FAMILY_NOTE) ? "family note set" : "has a different note, left alone"}`,
    );
    continue;
  }

  const { width, height, placements } = barTiling(n);
  const copies = placements.length;
  const entry = store.entry(shape);
  if (entry.properties.rectifiable?.value === false)
    throw new Error(`${shape.id} is recorded as tiling no rectangle`);
  const order = entry.properties.order;
  if (typeof order?.value === "number" && order.value > copies)
    throw new Error(
      `${shape.id} has order ${order.value}, but the construction uses ${copies} copies`,
    );
  store.setProperty(
    shape,
    "rectifiable",
    {
      status: "computed",
      ref: SOLVER_REF,
      value: true,
      reason: `The bar construction tiles a ${width} x ${height} rectangle.`,
    },
    "bar-family",
  );
  const upper = order?.upper;
  if (order?.status === "open" || order === undefined) {
    if (upper === undefined || upper > copies)
      store.replaceOpen(shape, "order", {
        status: "open",
        upper: copies,
        ...(order?.lower !== undefined && { lower: order.lower }),
        ref: SOLVER_REF,
        note: `Upper bound from the ${width} x ${height} bar construction.`,
      } as PropertyRecord<unknown>);
  }
  if (!store.setNote(shape, BAR_FAMILY_NOTE))
    console.log(`n=${n} ${shape.id}: has a different note, left alone`);
  const hasTiling = existsSync(join(DATA_DIR, "tilings", shape.id));
  if (!hasTiling && !dryRun)
    store.writeTiling(shape, {
      width,
      height,
      placements,
      ref: SOLVER_REF,
      note: "The bar construction (tools/bar-family.ts).",
    });
  console.log(
    `n=${n} ${shape.id} (${shape.size} cells): ${width} x ${height} with ${copies} copies${hasTiling ? ", tiling already stored" : ""}`,
  );
}
if (store.conflicts.length > 0)
  throw new Error(`conflicts: ${JSON.stringify(store.conflicts)}`);
console.log(dryRun ? "dry run, nothing written" : store.save());
