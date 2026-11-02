import { describe, expect, it } from "vitest";
import { runColorsJob } from "../tools/lib/colors-job";

const PARAMETERS = { maxFactor: 4, maxCopies: 120, stepBudget: 1_000_000 };

describe("runColorsJob", () => {
  it("finds a 2-colorable rectangle tiling of the L-tromino", () => {
    const outcome = runColorsJob(
      { id: "c080", order: 2, upper: 3 },
      PARAMETERS,
    );
    expect(outcome.tilings.map((tiling) => tiling.limit)).toEqual([2]);
    const [tiling] = outcome.tilings;
    expect((tiling?.width ?? 0) * (tiling?.height ?? 0)).toBe(6);
  });

  it("reports nothing when the copy cap leaves no candidate", () => {
    const outcome = runColorsJob(
      { id: "c080", order: 2, upper: 3 },
      { ...PARAMETERS, maxCopies: 1 },
    );
    expect(outcome.tilings).toEqual([]);
  });
});
