import type { Placement } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";
import { tileRectangle } from "../../src/core/solver";

export interface ColorsParameters {
  /** Rectangles holding up to maxFactor times the order in copies are tried... */
  readonly maxFactor: number;
  /** ...but never more than this many copies. */
  readonly maxCopies: number;
  readonly stepBudget: number;
}

export interface ColorsJob {
  readonly id: string;
  readonly order: number;
  /** Best known number of colors; the search looks for tilings needing fewer. */
  readonly upper: number;
}

export interface ColorsTiling {
  readonly limit: number;
  readonly width: number;
  readonly height: number;
  readonly placements: Placement[];
}

export interface ColorsOutcome {
  readonly id: string;
  /** One tiling per improvement, best last. Empty when nothing beat the known bound. */
  readonly tilings: ColorsTiling[];
  readonly milliseconds: number;
}

export function runColorsJob(
  job: ColorsJob,
  parameters: ColorsParameters,
): ColorsOutcome {
  const started = performance.now();
  const shape = Polyomino.fromId(job.id);
  const minSide = Math.min(shape.width, shape.height);
  const lastCopies = Math.min(
    parameters.maxFactor * job.order,
    parameters.maxCopies,
  );
  const tilings: ColorsTiling[] = [];
  search: for (let limit = job.upper - 1; limit >= 2; limit--) {
    for (let copies = job.order; copies <= lastCopies; copies++) {
      const area = copies * shape.size;
      for (let width = minSide; width * width <= area; width++) {
        if (area % width !== 0) continue;
        const height = area / width;
        const result = tileRectangle(
          shape,
          width,
          height,
          parameters.stepBudget,
          limit,
        );
        if (result.kind !== "found") continue;
        tilings.push({ limit, width, height, placements: result.value });
        continue search;
      }
    }
    break;
  }
  return { id: job.id, tilings, milliseconds: performance.now() - started };
}
