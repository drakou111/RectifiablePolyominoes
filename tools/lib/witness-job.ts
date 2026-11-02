import type { Placement } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";
import { tileRectangleExactCover } from "../../src/core/exact-cover";

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
