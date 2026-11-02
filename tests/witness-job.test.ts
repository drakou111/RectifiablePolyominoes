import { describe, expect, it } from "vitest";
import { expandTiling } from "../src/core/tiling";
import { Polyomino } from "../src/core/polyomino";
import { runWitnessJob } from "../tools/lib/witness-job";

const PARAMETERS = { stepBudget: 1_000_000 };

describe("runWitnessJob", () => {
  it("finds a valid tiling of the L-tetromino's 4 x 4 square", () => {
    const outcome = runWitnessJob(
      { id: "e080", kind: "square", rectangles: [[4, 4]] },
      PARAMETERS,
    );
    if (outcome.kind !== "found") throw new Error(`got ${outcome.kind}`);
    const expanded = expandTiling(
      Polyomino.fromId("e080"),
      outcome.width,
      outcome.height,
      outcome.placements,
    );
    expect(expanded.problems).toEqual([]);
  });

  it("puts the narrow side first and tries candidates in order", () => {
    const outcome = runWitnessJob(
      {
        id: "e080",
        kind: "odd",
        rectangles: [
          [3, 3],
          [8, 2],
        ],
      },
      PARAMETERS,
    );
    expect(outcome.kind === "found" && [outcome.width, outcome.height]).toEqual(
      [2, 8],
    );
  });

  it("reports impossible when no candidate tiles", () => {
    const outcome = runWitnessJob(
      { id: "e080", kind: "prime", rectangles: [[3, 3]] },
      PARAMETERS,
    );
    expect(outcome.kind).toBe("impossible");
  });
});
