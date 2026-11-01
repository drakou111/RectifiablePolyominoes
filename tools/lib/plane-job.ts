import {
  coverSquare,
  periodicTiling,
  type PeriodicTiling,
} from "../../src/core/plane";
import { Polyomino } from "../../src/core/polyomino";
import { cornerTest } from "../../src/core/solver";
import { halfStripProof } from "../../src/core/strip";

export interface PlaneParameters {
  /** Periodic tilings with up to this many copies per period are searched. */
  readonly maxCopies: number;
  /** Square sides tried by the cover test, in order. */
  readonly sides: readonly number[];
  readonly cornerDepths: readonly number[];
  readonly maxBandHeight: number;
  readonly maxStates: number;
  readonly stepBudget: number;
}

export interface PlaneJob {
  readonly id: string;
  readonly decideHalfStrip: boolean;
  readonly decidePlane: boolean;
}

export type HalfStripResult =
  | { kind: "yes"; width: number }
  | { kind: "no-corner"; depth: number }
  | { kind: "no-band"; bandHeight: number; states: number }
  | { kind: "undecided" }
  | { kind: "skipped" };

export type PlaneResult =
  | { kind: "yes"; tiling: PeriodicTiling }
  | { kind: "no"; side: number }
  | { kind: "undecided" }
  | { kind: "skipped" };

export interface PlaneOutcome {
  readonly id: string;
  readonly halfStrip: HalfStripResult;
  readonly plane: PlaneResult;
  readonly milliseconds: number;
}

export function runPlaneJob(
  job: PlaneJob,
  parameters: PlaneParameters,
): PlaneOutcome {
  const started = performance.now();
  const polyomino = Polyomino.fromId(job.id);

  let halfStrip: HalfStripResult = { kind: "skipped" };
  if (job.decideHalfStrip) {
    halfStrip = { kind: "undecided" };
    // A blocked corner test covers half-strips too: their end corners are rectangle-like corners.
    for (const depth of parameters.cornerDepths) {
      const corner = cornerTest(polyomino, depth, parameters.stepBudget);
      if (corner.kind === "blocked") {
        halfStrip = { kind: "no-corner", depth };
        break;
      }
      if (corner.kind === "budget") break;
    }
    if (halfStrip.kind === "undecided") {
      const proof = halfStripProof(
        polyomino,
        parameters.maxBandHeight,
        parameters.maxStates,
      );
      if (proof.kind === "half-strip")
        halfStrip = { kind: "yes", width: proof.width };
      else if (proof.kind === "no-half-strip")
        halfStrip = {
          kind: "no-band",
          bandHeight: proof.bandHeight,
          states: proof.states,
        };
    }
  }

  let plane: PlaneResult = { kind: "skipped" };
  if (job.decidePlane && halfStrip.kind !== "yes") {
    plane = { kind: "undecided" };
    const periodic = periodicTiling(
      polyomino,
      parameters.maxCopies,
      parameters.stepBudget,
    );
    if (typeof periodic === "object") plane = { kind: "yes", tiling: periodic };
    else
      for (const side of parameters.sides) {
        const cover = coverSquare(polyomino, side, parameters.stepBudget);
        if (cover.kind === "impossible") {
          plane = { kind: "no", side };
          break;
        }
        if (cover.kind === "budget") break;
      }
  }
  return {
    id: job.id,
    halfStrip,
    plane,
    milliseconds: performance.now() - started,
  };
}
