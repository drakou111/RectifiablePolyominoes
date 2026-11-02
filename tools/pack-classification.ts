import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { PolyominoEntry } from "../src/core/model";
import {
  CLASSIFICATION_DIR,
  formatClassification,
  parseClassification,
  type ClassificationLine,
} from "../src/core/classification";
import { DATA_DIR, PROJECT_ROOT, printHelpIfAsked } from "./lib/store";

const USAGE = `Removes "tiles no rectangle" entries of the given sizes from data/, keeping a record in
output/classification/<n>.txt.

Usage: npx tsx tools/pack-classification.ts --sizes <list> [--dry-run]

  --sizes <list>  comma-separated piece sizes, e.g. 11,12
  --dry-run       report only

The catalogue keeps only pieces that tile a rectangle or are open. Every entry whose rectifiable
value is "no" is written to the record (ID and an index into a table of reasons; other properties
are dropped) and then deleted. The record is local evidence for each size's "tile no rectangle"
count, outside the published data. Lines already in the record are kept.`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const sizes = argument("--sizes", "").split(",").filter(Boolean).map(Number);
if (sizes.length === 0 || sizes.some((n) => !Number.isInteger(n) || n < 1))
  throw new Error("--sizes needs a list of piece sizes, e.g. 11,12");
const dryRun = process.argv.includes("--dry-run");

const isNo = (entry: PolyominoEntry): boolean => {
  const record = entry.properties.rectifiable;
  return (
    record !== undefined &&
    record.status !== "open" &&
    record.value === false &&
    typeof (record.reason ?? record.ref) === "string"
  );
};

/** A one-line reason: the proof idea, or the source it comes from. */
function reasonOf(entry: PolyominoEntry): string {
  const record = entry.properties.rectifiable;
  if (record === undefined)
    throw new Error(`${entry.id} has no rectifiable record`);
  const source = [record.ref, record.refDetail].filter(Boolean).join(", ");
  const text = record.reason ?? `See ${source}.`;
  return record.reason !== undefined && source !== ""
    ? `${text} (${source})`
    : text;
}

const recordDir = join(PROJECT_ROOT, "output", CLASSIFICATION_DIR);
mkdirSync(recordDir, { recursive: true });
for (const size of sizes) {
  const directory = join(DATA_DIR, "polyominoes", String(size));
  const target = join(recordDir, `${size}.txt`);
  const existing: readonly ClassificationLine[] = existsSync(target)
    ? parseClassification(readFileSync(target, "utf8")).lines
    : [];
  const lines = new Map(existing.map((line) => [line.id, line]));
  const packed: string[] = [];
  if (!existsSync(directory)) continue;
  for (const file of readdirSync(directory)) {
    const entry = JSON.parse(
      readFileSync(join(directory, file), "utf8"),
    ) as PolyominoEntry;
    if (!isNo(entry)) continue;
    lines.set(entry.id, { id: entry.id, reason: reasonOf(entry) });
    packed.push(file);
  }
  const text = formatClassification(size, [...lines.values()]);
  console.log(
    `size ${size}: ${packed.length} entries packed, ${lines.size} lines in ${relative(PROJECT_ROOT, target)}`,
  );
  if (dryRun) continue;
  writeFileSync(target, text);
  // Check the file reads back to the same lines before removing anything.
  const check = parseClassification(readFileSync(target, "utf8"));
  if (check.size !== size || check.lines.length !== lines.size)
    throw new Error(`${target} does not read back correctly`);
  for (const file of packed) rmSync(join(directory, file));
}
