import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { deriveProperties, inferProperties } from "../src/core/derived";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import type { Properties, PropertyRecord } from "../src/core/model";
import type { Polyomino } from "../src/core/polyomino";
import {
  decidePlaneSat,
  planeSchedule,
  type PlaneSatResult,
} from "./lib/plane-sat";
import { DataStore, PROJECT_ROOT, printHelpIfAsked } from "./lib/store";

const USAGE = `Decides "tiles the plane" with a SAT solver where tools/plane.ts left it open.

Usage: npx tsx tools/plane-sat.ts [options]

  --max-size <n>    largest piece size (default 10)
  --max-copies <k>  largest number of copies per period tried (default 20)
  --sides <list>    square sides for the cover test (default 12,16,20,24)
  --seconds <s>     time limit per piece (default 600)
  --workers <n>     pieces at once (default 16)
  --only <ids>      comma-separated IDs
  --dry-run         list the pieces only

Torus searches (every period lattice in Hermite normal form) and cover tests run interleaved,
small first: a torus tiling proves a periodic plane tiling; an s x s square that no arrangement
of copies covers proves there is none. Needs uv (tools/sat/plane_sat.py). Each verdict is saved
at once; progress goes to output/plane-sat/run.log.`;

const SOURCE_REF = "site-solver";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const maxSize = Number(argument("--max-size", "10"));
const maxCopies = Number(argument("--max-copies", "20"));
const sides = argument("--sides", "12,16,20,24").split(",").map(Number);
const seconds = Number(argument("--seconds", "600"));
const workers = Number(argument("--workers", "16"));
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
for (const value of [maxSize, maxCopies, seconds, workers, ...sides])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`numeric options must be positive integers, got ${value}`);

const store = new DataStore();
const effective = (shape: Polyomino): Properties => {
  const properties = {
    ...deriveProperties(shape),
    ...store.entry(shape).properties,
  } as Properties;
  return { ...properties, ...inferProperties(properties) };
};
const pieces = enumerateFreePolyominoes(maxSize)
  .flat()
  .filter(
    (shape) =>
      (only.size === 0 || only.has(shape.id)) &&
      effective(shape).tilesPlane === undefined,
  );
const schedule = planeSchedule(maxCopies, sides);
const settings = { maxSize, maxCopies, sides, seconds, workers };
console.log(`${pieces.length} pieces`, settings);
if (dryRun) {
  console.log(pieces.map((shape) => shape.id).join(" "));
  process.exit(0);
}

const logDir = join(PROJECT_ROOT, "output", "plane-sat");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, "run.log");
appendFileSync(
  logPath,
  `\n# ${new Date().toISOString()} ${pieces.length} pieces ${JSON.stringify(settings)}\n`,
);
const log = (line: string): void => {
  appendFileSync(logPath, `${line}\n`);
  console.log(line);
};

const copiesText = (count: number): string =>
  count === 1 ? "1 copy" : `${count} copies`;
const tally = { yes: 0, no: 0, undecided: 0 };

const record = (shape: Polyomino, result: PlaneSatResult): void => {
  if (result.kind === "undecided") {
    tally.undecided++;
    log(`${shape.id}: undecided`);
    return;
  }
  const known = effective(shape);
  if (
    result.kind === "no" &&
    (known.rectifiable?.value === true || known.tilesHalfStrip?.value === true)
  )
    throw new Error(
      `${shape.id}: no plane tiling, but the data says it tiles a rectangle or half-strip`,
    );
  const reason =
    result.kind === "tiles"
      ? `A periodic tiling exists with ${copiesText(result.copies)} per period (period lattice (${result.a}, 0), (${result.b}, ${result.c})).`
      : `No arrangement of copies covers a ${result.side} x ${result.side} square (SAT solver), and every plane tiling would.`;
  const value = result.kind === "tiles";
  store.setProperty(
    shape,
    "tilesPlane",
    {
      status: "computed",
      value,
      ref: SOURCE_REF,
      reason,
    } as PropertyRecord<unknown>,
    "plane-sat",
  );
  store.save();
  tally[value ? "yes" : "no"]++;
  log(`${shape.id}: ${value ? "tiles" : "no"}: ${reason}`);
};

let next = 0;
let done = 0;
const lane = async (): Promise<void> => {
  for (
    let shape = pieces[next++];
    shape !== undefined;
    shape = pieces[next++]
  ) {
    record(shape, await decidePlaneSat(shape, schedule, seconds));
    if (++done % 25 === 0)
      log(`${done}/${pieces.length} done ${JSON.stringify(tally)}`);
  }
};
await Promise.all(Array.from({ length: workers }, lane));
log(`# done ${JSON.stringify(tally)}`);
