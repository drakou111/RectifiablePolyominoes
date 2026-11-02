import type { Placement } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";
import { tileRectangleExactCover } from "../../src/core/exact-cover";
import { tileRectangleNative, type NativeSettings } from "./native-tiler";

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
  /** The native search ran out of candidates, but its lossy cache makes that no proof. */
  | { readonly kind: "exhausted" }
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
export async function runWitnessJobNative(
  job: WitnessJob,
  settings: NativeWitnessSettings,
): Promise<WitnessOutcome> {
  const started = performance.now();
  const polyomino = Polyomino.fromId(job.id);
  const open = new Set(job.rectangles.map((_, index) => index));
  for (const seed of settings.seeds)
    for (const [index, [a, b]] of job.rectangles.entries()) {
      if (!open.has(index)) continue;
      const result = await tileRectangleNative(polyomino, a, b, {
        ...settings,
        seed,
      });
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
    kind: open.size === 0 ? "exhausted" : "budget",
    milliseconds: performance.now() - started,
  };
}
