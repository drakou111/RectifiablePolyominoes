import { Polyomino } from "../../src/core/polyomino";
import {
  cornerTest,
  smallOrder,
  tileRectangle,
  type OrderResult,
} from "../../src/core/solver";
import type { Placement } from "../../src/core/model";

export interface SolveParameters {
  readonly maxCopies: number;
  readonly depths: readonly number[];
  readonly stepBudget: number;
}

export interface SolveJob {
  readonly id: string;
  /** Run the small-order search (skipped when the order is already known). */
  readonly searchOrder: boolean;
  /** Run the corner test (skipped when rectifiability is already known). */
  readonly testCorner: boolean;
  /** Known smallest rectangles that still need an example tiling. */
  readonly tileSizes: readonly (readonly [number, number])[];
}

export interface SolveOutcome {
  readonly id: string;
  readonly order: OrderResult | "budget" | "none" | "skipped";
  readonly corner:
    | { kind: "blocked"; depth: number }
    | { kind: "fillable" }
    | { kind: "budget" }
    | { kind: "skipped" };
  readonly tilings: {
    width: number;
    height: number;
    placements: Placement[];
  }[];
  readonly milliseconds: number;
}

export function runJob(
  job: SolveJob,
  parameters: SolveParameters,
): SolveOutcome {
  const started = performance.now();
  const polyomino = Polyomino.fromId(job.id);

  // The corner test is cheap and settles most pieces; an order search after a proof of
  // impossibility could only come back empty.
  let corner: SolveOutcome["corner"] = { kind: "skipped" };
  if (job.testCorner) {
    for (const depth of parameters.depths) {
      corner = cornerTest(polyomino, depth, parameters.stepBudget);
      if (corner.kind !== "fillable") break;
    }
  }

  let order: SolveOutcome["order"] = "skipped";
  if (job.searchOrder && corner.kind !== "blocked")
    order =
      smallOrder(polyomino, parameters.maxCopies, parameters.stepBudget) ??
      "none";

  const tilings: SolveOutcome["tilings"] = [];
  for (const [width, height] of job.tileSizes) {
    const result = tileRectangle(
      polyomino,
      width,
      height,
      parameters.stepBudget,
    );
    if (result.kind === "found")
      tilings.push({ width, height, placements: result.value });
  }
  return {
    id: job.id,
    order,
    corner,
    tilings,
    milliseconds: performance.now() - started,
  };
}
