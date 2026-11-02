import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assembleTiling,
  tileableRectanglesOfArea,
  type RectangleTiling,
} from "../src/core/compose";
import { tileRectangleExactCover } from "../src/core/exact-cover";
import type { PrimeRectangles, TilingFile } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { PrimeClosure } from "../src/core/prime-closure";
import { expandTiling } from "../src/core/tiling";
import { DATA_DIR, DataStore, printHelpIfAsked } from "./lib/store";

const USAGE = `Builds missing smallest-square and smallest-odd tilings by gluing prime rectangles.

Usage: npx tsx tools/assemble.ts [--only <ids>] [--budget <steps>] [--dry-run]

  --only <ids>      comma-separated IDs
  --budget <steps>  exact-cover budget for a prime piece with no stored tiling (default 2000000)
  --dry-run         report only

Every tileable rectangle is glued from primes, so a square or odd rectangle that the prime
closure confirms can be cut into prime pieces. Pieces come from stored tilings (turned as
needed) or a short exact-cover search. Each result is checked before it is written.`;

const MAX_CLOSURE_SIDE = 400;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

printHelpIfAsked(USAGE);
const only = new Set(argument("--only", "").split(",").filter(Boolean));
const budget = Number(argument("--budget", "2000000"));
const dryRun = process.argv.includes("--dry-run");
if (!Number.isInteger(budget) || budget < 1)
  throw new Error("--budget must be a positive integer");

function storedTilings(id: string): RectangleTiling[] {
  const directory = join(DATA_DIR, "tilings", id);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).map((name) => {
    const file = JSON.parse(
      readFileSync(join(directory, name), "utf8"),
    ) as TilingFile;
    return {
      width: file.width,
      height: file.height,
      placements: file.placements,
    };
  });
}

const sizeKey = (a: number, b: number): string =>
  `${Math.min(a, b)}x${Math.max(a, b)}`;

const store = new DataStore();
const tally = { built: 0, failed: 0 };
for (const size of readdirSync(join(DATA_DIR, "polyominoes"))) {
  for (const file of readdirSync(join(DATA_DIR, "polyominoes", size))) {
    const shape = Polyomino.fromId(file.replace(/\.json$/, ""));
    if (only.size > 0 && !only.has(shape.id)) continue;
    if (shape.isRectangle()) continue;
    const properties = store.entry(shape).properties;
    const primes = properties.primeRectangles?.value as
      PrimeRectangles | undefined;
    if (primes === undefined) continue;

    const stored = storedTilings(shape.id);
    const storedBySize = new Map(
      stored.map((t) => [sizeKey(t.width, t.height), t]),
    );
    const directory = join(DATA_DIR, "tilings", shape.id);
    const hasOdd =
      existsSync(directory) &&
      readdirSync(directory).some((name) => name.includes("-odd"));

    const targets: {
      kind: "square" | "odd";
      candidates: [number, number][];
    }[] = [];
    const square = properties.smallestSquare?.value;
    if (
      typeof square === "number" &&
      !storedBySize.has(sizeKey(square, square))
    )
      targets.push({ kind: "square", candidates: [[square, square]] });
    const odd = properties.oddOrder?.value;
    if (typeof odd === "number" && odd !== properties.order?.value && !hasOdd)
      targets.push({ kind: "odd", candidates: [] });
    if (targets.length === 0) continue;

    const minSide = Math.min(shape.width, shape.height);
    const limit = Math.min(
      MAX_CLOSURE_SIDE,
      Math.max(
        typeof square === "number" ? square : 0,
        typeof odd === "number" ? Math.ceil((odd * shape.size) / minSide) : 0,
      ),
    );
    const closure = new PrimeClosure(primes.rectangles, limit);
    const primeSizes = new Set(
      primes.rectangles.map(([a, b]) => sizeKey(a, b)),
    );
    const searched = new Map<string, RectangleTiling | undefined>();
    const source = (w: number, h: number): RectangleTiling | undefined => {
      const key = sizeKey(w, h);
      const hit = storedBySize.get(key);
      if (hit !== undefined) return hit;
      // Only primes need a search: anything else can be cut further.
      if (!primeSizes.has(key)) return undefined;
      if (!searched.has(key)) {
        const result = tileRectangleExactCover(shape, w, h, budget);
        searched.set(
          key,
          result.kind === "found"
            ? { width: w, height: h, placements: result.value }
            : undefined,
        );
      }
      return searched.get(key);
    };

    for (const target of targets) {
      const candidates =
        target.kind === "square"
          ? target.candidates
          : tileableRectanglesOfArea(closure, (odd as number) * shape.size);
      let built: RectangleTiling | undefined;
      for (const [w, h] of candidates) {
        built = assembleTiling(shape, closure, w, h, source);
        if (built !== undefined) break;
      }
      if (built === undefined) {
        tally.failed++;
        console.log(
          `${shape.id} ${target.kind}: no assembly (candidates ${JSON.stringify(candidates)})`,
        );
        continue;
      }
      const problems = expandTiling(
        shape,
        built.width,
        built.height,
        built.placements,
      ).problems;
      if (problems.length > 0)
        throw new Error(
          `${shape.id} ${target.kind}: assembled tiling is invalid: ${problems.join("; ")}`,
        );
      tally.built++;
      console.log(
        `${shape.id} ${target.kind}: ${built.width}x${built.height}, ${built.placements.length} copies`,
      );
      if (dryRun) continue;
      store.writeTiling(
        shape,
        {
          width: built.width,
          height: built.height,
          placements: [...built.placements],
          ref: "site-solver",
          note: `Smallest ${target.kind === "square" ? "square" : "odd tiling"}, glued from prime rectangle tilings (tools/assemble.ts).`,
        },
        target.kind === "odd" ? "odd" : undefined,
      );
    }
  }
}
console.log(dryRun ? "dry run, nothing written" : "done", tally);
