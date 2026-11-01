import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { inferProperties, deriveProperties } from "../src/core/derived";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import type { Properties, PropertyRecord } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import type { PlaneJob, PlaneOutcome, PlaneParameters } from "./lib/plane-job";
import { runPool } from "./lib/pool";
import {
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";

const USAGE = `Decides "tiles a half-strip" and "tiles the plane" by exhaustive search.

Usage: npx tsx tools/plane.ts [options]

  --min-size <n>     smallest piece size (default 1)
  --max-size <n>     largest piece size (default 10)
  --only <ids>       comma-separated IDs: process just these pieces
  --copies <k>       periodic tilings with up to k copies per period (default 4)
  --sides <list>     square sides for the cover test (default 4,5,6,7,8,9,10)
  --band-height <h>  largest band for the half-strip sweep (default 12)
  --max-states <n>   state limit of one sweep (default 2000000)
  --budget <steps>   step budget of one search (default 2000000)
  --workers <n>      worker threads (default: all cores)
  --dry-run          report only

Half-strip: a blocked corner test or an unreachable band sweep rules out every half-strip; an
infinite strict sweep is a half-strip tiling. Plane: a torus tiling is a periodic plane tiling;
an uncoverable square rules out plane tilings. Only empty properties are filled.`;

const SOURCE_REF = "site-solver";
const copiesText = (count: number): string =>
  count === 1 ? "1 copy" : `${count} copies`;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}
const list = (text: string): number[] =>
  text.split(",").filter(Boolean).map(Number);

printHelpIfAsked(USAGE);
const minSize = Number(argument("--min-size", "1"));
const maxSize = Number(argument("--max-size", "10"));
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const parameters: PlaneParameters = {
  maxCopies: Number(argument("--copies", "4")),
  sides: list(argument("--sides", "4,5,6,7,8,9,10")),
  cornerDepths: [6, 8],
  maxBandHeight: Number(argument("--band-height", "12")),
  maxStates: Number(argument("--max-states", "2000000")),
  stepBudget: Number(argument("--budget", "2000000")),
};
const workerCount = Number(
  argument("--workers", String(availableParallelism())),
);
for (const value of [
  minSize,
  maxSize,
  workerCount,
  parameters.maxCopies,
  parameters.maxBandHeight,
  parameters.maxStates,
  parameters.stepBudget,
  ...parameters.sides,
])
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`numeric options must be positive integers, got ${value}`);

const store = new DataStore();
const effective = (shape: Polyomino): Properties => {
  const properties: Properties = {
    ...deriveProperties(shape),
    ...store.entry(shape).properties,
  } as Properties;
  return { ...properties, ...inferProperties(properties) };
};

const jobs: PlaneJob[] = [];
for (const shape of enumerateFreePolyominoes(maxSize).flat()) {
  if (shape.size < minSize || (only.size > 0 && !only.has(shape.id))) continue;
  const known = effective(shape);
  const decideHalfStrip = known.tilesHalfStrip === undefined;
  const decidePlane = known.tilesPlane === undefined;
  if (decideHalfStrip || decidePlane)
    jobs.push({ id: shape.id, decideHalfStrip, decidePlane });
}
console.log(`${jobs.length} pieces to decide`);

const started = Date.now();
const outcomes = await runPool<PlaneJob, PlaneOutcome>(
  new URL("./lib/plane-worker-bootstrap.mjs", import.meta.url),
  parameters,
  jobs,
  workerCount,
);

const computed = (record: object): PropertyRecord<unknown> =>
  ({
    status: "computed",
    ref: SOURCE_REF,
    ...record,
  }) as PropertyRecord<unknown>;
const tally = { halfYes: 0, halfNo: 0, planeYes: 0, planeNo: 0 };
const undecided = { halfStrip: [] as string[], plane: [] as string[] };
const disagreements: string[] = [];
for (const outcome of outcomes.sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const shape = Polyomino.fromId(outcome.id);
  const known = effective(shape);
  const { halfStrip, plane } = outcome;

  if (
    halfStrip.kind === "yes" ||
    halfStrip.kind === "no-corner" ||
    halfStrip.kind === "no-band"
  ) {
    const value = halfStrip.kind === "yes";
    if (value) tally.halfYes++;
    else tally.halfNo++;
    if (!value && known.rectifiable?.value === true)
      disagreements.push(`${outcome.id}: rectifiable but no half-strip`);
    const reason =
      halfStrip.kind === "yes"
        ? `An exact column sweep finds an infinite tiling of the half-strip of width ${halfStrip.width}.`
        : halfStrip.kind === "no-corner"
          ? `No arrangement of copies fills the ${halfStrip.depth} x ${halfStrip.depth} corner of any rectangle or half-strip (exhaustive search).`
          : `A column sweep along the closed end, ${halfStrip.bandHeight} rows deep, can never reach the far wall flat, for any width (${halfStrip.states} states).`;
    if (!dryRun)
      store.setProperty(
        shape,
        "tilesHalfStrip",
        computed({ value, reason }),
        "plane",
      );
  } else if (halfStrip.kind === "undecided")
    undecided.halfStrip.push(outcome.id);

  if (plane.kind === "yes" || plane.kind === "no") {
    const value = plane.kind === "yes";
    if (value) tally.planeYes++;
    else tally.planeNo++;
    if (
      !value &&
      (known.rectifiable?.value === true || halfStrip.kind === "yes")
    )
      disagreements.push(
        `${outcome.id}: tiles a rectangle or half-strip but not the plane`,
      );
    const reason =
      plane.kind === "yes"
        ? `A periodic tiling exists with ${copiesText((plane.tiling.a * plane.tiling.c) / shape.size)} per period (period lattice (${plane.tiling.a}, 0), (${plane.tiling.b}, ${plane.tiling.c})).`
        : `No arrangement of copies covers a ${plane.side} x ${plane.side} square (exhaustive search), and every plane tiling would.`;
    if (!dryRun)
      store.setProperty(
        shape,
        "tilesPlane",
        computed({ value, reason }),
        "plane",
      );
  } else if (plane.kind === "undecided") undecided.plane.push(outcome.id);
}

const saved = dryRun ? "dry run, nothing written" : store.save();
const seconds = (Date.now() - started) / 1000;
console.log(
  `\n${jobs.length} pieces in ${seconds.toFixed(1)} s`,
  tally,
  `undecided: half-strip ${undecided.halfStrip.length}, plane ${undecided.plane.length}`,
);
console.log(saved);
if (disagreements.length > 0)
  console.log(`DISAGREEMENTS:\n  ${disagreements.join("\n  ")}`);
reportConflicts(store.conflicts);

const directory = join(PROJECT_ROOT, "output", "plane");
mkdirSync(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const slowest = [...outcomes]
  .sort((a, b) => b.milliseconds - a.milliseconds)
  .slice(0, 20)
  .map((o) => `${o.id} ${(o.milliseconds / 1000).toFixed(1)} s`);
writeFileSync(
  join(directory, `${stamp}.json`),
  JSON.stringify(
    {
      arguments: process.argv.slice(2),
      parameters,
      seconds,
      tally,
      undecided,
      disagreements,
      slowest,
    },
    null,
    2,
  ),
);
console.log(`summary saved to output/plane/${stamp}.json`);
