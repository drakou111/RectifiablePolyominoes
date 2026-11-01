import type { Placement } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";
import { tileRectangle } from "../../src/core/solver";

export interface SquaresParameters {
  readonly maxSquareCopies: number;
  readonly maxOddCopies: number;
  readonly stepBudget: number;
}

export interface SquaresJob {
  readonly id: string;
  readonly order: number;
  readonly findSquare: boolean;
  readonly findOdd: boolean;
}

export type SquareResult =
  | { kind: "found"; side: number; placements: Placement[] }
  /** No square up to the limit; every square with a side below lowerSide is impossible. */
  | { kind: "bound"; lowerSide: number }
  | { kind: "budget" }
  | { kind: "skipped" };

export type OddResult =
  | {
      kind: "found";
      copies: number;
      width: number;
      height: number;
      placements: Placement[];
    }
  | { kind: "bound"; lowerCopies: number }
  | { kind: "budget" }
  | { kind: "skipped" };

export interface SquaresOutcome {
  readonly id: string;
  readonly square: SquareResult;
  readonly odd: OddResult;
}

function findSquare(
  polyomino: Polyomino,
  order: number,
  parameters: SquaresParameters,
): SquareResult {
  const n = polyomino.size;
  let lowerSide = Math.ceil(Math.sqrt(order * n));
  for (
    let side = lowerSide;
    side * side <= parameters.maxSquareCopies * n;
    side++
  ) {
    if ((side * side) % n !== 0) continue;
    const result = tileRectangle(polyomino, side, side, parameters.stepBudget);
    if (result.kind === "budget")
      return lowerSide > Math.ceil(Math.sqrt(order * n))
        ? { kind: "bound", lowerSide }
        : { kind: "budget" };
    if (result.kind === "found")
      return { kind: "found", side, placements: result.value };
    lowerSide = side + 1;
  }
  return { kind: "bound", lowerSide };
}

function findOdd(
  polyomino: Polyomino,
  order: number,
  parameters: SquaresParameters,
): OddResult {
  const n = polyomino.size;
  const minSide = Math.min(polyomino.width, polyomino.height);
  const first = order % 2 === 1 ? order : order + 1;
  for (let copies = first; copies <= parameters.maxOddCopies; copies += 2) {
    const area = copies * n;
    for (let width = minSide; width * width <= area; width++) {
      if (area % width !== 0) continue;
      const result = tileRectangle(
        polyomino,
        width,
        area / width,
        parameters.stepBudget,
      );
      if (result.kind === "budget")
        return copies > first
          ? { kind: "bound", lowerCopies: copies }
          : { kind: "budget" };
      if (result.kind === "found")
        return {
          kind: "found",
          copies,
          width,
          height: area / width,
          placements: result.value,
        };
    }
  }
  const next =
    parameters.maxOddCopies % 2 === 1
      ? parameters.maxOddCopies + 2
      : parameters.maxOddCopies + 1;
  return { kind: "bound", lowerCopies: Math.max(first, next) };
}

export function runSquaresJob(
  job: SquaresJob,
  parameters: SquaresParameters,
): SquaresOutcome {
  const polyomino = Polyomino.fromId(job.id);
  return {
    id: job.id,
    square: job.findSquare
      ? findSquare(polyomino, job.order, parameters)
      : { kind: "skipped" },
    odd: job.findOdd
      ? findOdd(polyomino, job.order, parameters)
      : { kind: "skipped" },
  };
}
