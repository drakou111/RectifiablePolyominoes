import type { Placement } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";
import { tileRectangleExactCover } from "../../src/core/exact-cover";
import {
  tileRectangleNative,
  type NativeResult,
  type NativeSettings,
} from "./native-tiler";
import { tileRectangleSat, type SatSettings } from "./sat-tiler";

export interface WitnessParameters {
  readonly stepBudget: number;
}

export type WitnessKind = "square" | "odd" | "prime";

/** Find one tiling of any of `rectangles` (tried in order) to picture a property. */
export interface WitnessJob {
  readonly id: string;
  readonly kind: WitnessKind;
  readonly rectangles: readonly (readonly [number, number])[];
}

export type WitnessOutcome = {
  readonly job: WitnessJob;
  readonly milliseconds: number;
} & (
  | {
      readonly kind: "found";
      readonly width: number;
      readonly height: number;
      readonly placements: Placement[];
    }
  /** Every candidate was searched to the end without a tiling: contradicts the data. */
  | { readonly kind: "impossible" }
  | { readonly kind: "budget" }
);

export function runWitnessJob(
  job: WitnessJob,
  parameters: WitnessParameters,
): WitnessOutcome {
  const started = performance.now();
  const polyomino = Polyomino.fromId(job.id);
  let budgetHit = false;
  for (const [a, b] of job.rectangles) {
    const width = Math.min(a, b);
    const height = Math.max(a, b);
    const result = tileRectangleExactCover(
      polyomino,
      width,
      height,
      parameters.stepBudget,
    );
    if (result.kind === "found")
      return {
        job,
        kind: "found",
        width,
        height,
        placements: result.value,
        milliseconds: performance.now() - started,
      };
    if (result.kind === "budget") budgetHit = true;
  }
  return {
    job,
    kind: budgetHit ? "budget" : "impossible",
    milliseconds: performance.now() - started,
  };
}

export interface NativeWitnessSettings extends Omit<NativeSettings, "seed"> {
  /** One restart per seed, each with the full budget, until a tiling turns up. */
  readonly seeds: readonly number[];
}

/** Like runWitnessJob, with the native frontier tiler and random restarts. */
export function runWitnessJobNative(
  job: WitnessJob,
  settings: NativeWitnessSettings,
): Promise<WitnessOutcome> {
  return runWithRestarts(job, settings.seeds, (polyomino, a, b, seed) =>
    tileRectangleNative(polyomino, a, b, { ...settings, seed }),
  );
}

/** Like runWitnessJob, with the SAT tiler: one attempt per rectangle. */
export function runWitnessJobSat(
  job: WitnessJob,
  settings: SatSettings,
): Promise<WitnessOutcome> {
  return runWithRestarts(job, [0], (polyomino, a, b) =>
    tileRectangleSat(polyomino, a, b, settings),
  );
}

/**
 * Tries each rectangle once per seed until one is tiled. Both searches are exact, so a
 * rectangle searched to the end has no tiling and is dropped; all dropped contradicts the data.
 */
async function runWithRestarts(
  job: WitnessJob,
  seeds: readonly number[],
  search: (
    polyomino: Polyomino,
    a: number,
    b: number,
    seed: number,
  ) => Promise<NativeResult>,
): Promise<WitnessOutcome> {
  const started = performance.now();
  const polyomino = Polyomino.fromId(job.id);
  const open = new Set(job.rectangles.map((_, index) => index));
  for (const seed of seeds)
    for (const [index, [a, b]] of job.rectangles.entries()) {
      if (!open.has(index)) continue;
      const result = await search(polyomino, a, b, seed);
      if (result.kind === "found")
        return {
          job,
          kind: "found",
          width: result.width,
          height: result.height,
          placements: result.placements,
          milliseconds: performance.now() - started,
        };
      // An exhausted rectangle stays exhausted under any seed.
      if (result.kind === "exhausted") open.delete(index);
    }
  return {
    job,
    kind: open.size === 0 ? "impossible" : "budget",
    milliseconds: performance.now() - started,
  };
}
