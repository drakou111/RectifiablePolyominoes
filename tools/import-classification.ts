import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLASSIFICATION_DIR,
  formatClassification,
  parseClassification,
} from "../src/core/classification";
import type { PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { DataStore, PROJECT_ROOT, printHelpIfAsked } from "./lib/store";

const USAGE = `Imports a whole-size rectifiability classification (one line per free polyomino).

Usage: npx tsx tools/import-classification.ts --file <path> --ref <key> [--dry-run]

  --file <path>  lines "x,y;x,y;... <verdict>", verdict an order, DoesNotTile or Unknown
  --ref <key>    reference key in data/references.json for the file's results

Per piece:
  order        entry gets rectifiable yes and the order (only where missing), from --ref
  DoesNotTile  recorded in output/classification/<n>.txt (never in data/); an entry that says the
               piece tiles a rectangle or is open stops the import
  Unknown      an open rectifiable entry is created if the piece has no entry and is not
               already known to tile no rectangle
Every other disagreement is reported and stops the import before anything is written.`;

const ORDER = /^\d+$/;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

printHelpIfAsked(USAGE);
const file = argument("--file");
const ref = argument("--ref");
const dryRun = process.argv.includes("--dry-run");

const references = JSON.parse(
  readFileSync(join(PROJECT_ROOT, "data", "references.json"), "utf8"),
) as Record<string, unknown>;
if (references[ref] === undefined)
  throw new Error(`unknown reference "${ref}"`);

const verdicts = new Map<string, string>();
let size = 0;
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (line.trim() === "") continue;
  const [cells, verdict] = line.trim().split(" ");
  if (cells === undefined || verdict === undefined)
    throw new Error(`bad line: ${line}`);
  if (
    verdict !== "DoesNotTile" &&
    verdict !== "Unknown" &&
    !ORDER.test(verdict)
  )
    throw new Error(`bad verdict: ${line}`);
  const polyomino = Polyomino.fromCells(
    cells.split(";").map((cell) => {
      const [x, y] = cell.split(",").map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y))
        throw new Error(`bad cell "${cell}" in: ${line}`);
      return { x: x as number, y: y as number };
    }),
  );
  if (size === 0) size = polyomino.size;
  if (polyomino.size !== size)
    throw new Error(`mixed sizes ${size} and ${polyomino.size} in ${file}`);
  if (verdicts.has(polyomino.id))
    throw new Error(`${polyomino.id} appears twice in ${file}`);
  verdicts.set(polyomino.id, verdict);
}

const recordPath = join(
  PROJECT_ROOT,
  "output",
  CLASSIFICATION_DIR,
  `${size}.txt`,
);
const record = new Map(
  (existsSync(recordPath)
    ? parseClassification(readFileSync(recordPath, "utf8")).lines
    : []
  ).map((line) => [line.id, line.reason]),
);
const store = new DataStore();
const problems: string[] = [];
const tally = { orders: 0, newNo: 0, newOpen: 0, agreed: 0 };
const writes: (() => void)[] = [];
const sourceReason = `Shown to tile no rectangle by a contributed classification (${ref}).`;

for (const [id, verdict] of verdicts) {
  const polyomino = Polyomino.fromId(id);
  if (polyomino.isRectangle()) {
    if (verdict !== "1")
      problems.push(`${id}: a rectangle, but the file says ${verdict}`);
    continue;
  }
  const existing = store.entry(polyomino).properties;
  const rectifiable = existing.rectifiable;
  const knownNo = record.has(id) || polyomino.hasHole();
  if (ORDER.test(verdict)) {
    const order = Number(verdict);
    if (knownNo)
      problems.push(
        `${id}: the file gives order ${order}, our record says no rectangle`,
      );
    else if (
      existing.order?.value !== undefined &&
      existing.order.value !== order
    )
      problems.push(
        `${id}: the file gives order ${order}, the data says ${existing.order.value}`,
      );
    else if (existing.order?.value === order) tally.agreed++;
    else {
      tally.orders++;
      writes.push(() => {
        const rectifiableRecord: PropertyRecord<unknown> = {
          status: "proven",
          value: true,
          ref,
        };
        if (rectifiable === undefined)
          store.setProperty(polyomino, "rectifiable", rectifiableRecord, ref);
        else store.replaceOpen(polyomino, "rectifiable", rectifiableRecord);
        const orderRecord: PropertyRecord<unknown> = {
          status: "proven",
          value: order,
          ref,
        };
        if (existing.order === undefined)
          store.setProperty(polyomino, "order", orderRecord, ref);
        else store.replaceOpen(polyomino, "order", orderRecord);
      });
    }
  } else if (verdict === "DoesNotTile") {
    if (rectifiable?.value === true)
      problems.push(
        `${id}: the file says it tiles no rectangle, the data says it does`,
      );
    else if (rectifiable?.status === "open")
      problems.push(
        `${id}: the file says it tiles no rectangle, the data says open; settle by hand`,
      );
    else if (knownNo) tally.agreed++;
    else {
      tally.newNo++;
      record.set(id, sourceReason);
    }
  } else if (rectifiable === undefined && !knownNo) {
    tally.newOpen++;
    writes.push(() =>
      store.setProperty(
        polyomino,
        "rectifiable",
        {
          status: "open",
          ref: "site-solver",
          note: `Not resolved by this site's first searches, and unknown in a contributed classification (${ref}).`,
        } as PropertyRecord<unknown>,
        ref,
      ),
    );
  } else tally.agreed++;
}

console.log(`size ${size}: ${verdicts.size} pieces`, tally);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  throw new Error(`${problems.length} disagreements; nothing written`);
}
if (!dryRun) {
  for (const write of writes) write();
  store.save();
  writeFileSync(
    recordPath,
    formatClassification(
      size,
      [...record].map(([id, reason]) => ({ id, reason })),
    ),
  );
}
