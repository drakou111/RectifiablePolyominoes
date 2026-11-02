import { describe, expect, it } from "vitest";
import { tileRectangleExactCover } from "../src/core/exact-cover";
import { Polyomino } from "../src/core/polyomino";
import { expandTiling } from "../src/core/tiling";

const BUDGET = 5_000_000;

describe("tileRectangleExactCover", () => {
  it("finds a valid Y-pentomino tiling of 15 x 15, out of reach of the reading-order search", () => {
    const y = Polyomino.fromId("f040");
    const result = tileRectangleExactCover(y, 15, 15, BUDGET);
    if (result.kind !== "found") throw new Error(`got ${result.kind}`);
    expect(result.value).toHaveLength(45);
    expect(expandTiling(y, 15, 15, result.value).problems).toEqual([]);
  });

  it("proves impossibility, both by area and by search", () => {
    const l = Polyomino.fromId("e080");
    expect(tileRectangleExactCover(l, 3, 3, BUDGET).kind).toBe("impossible");
    expect(tileRectangleExactCover(l, 1, 8, BUDGET).kind).toBe("impossible");
    // The T-tetromino tiles no 4 x 2 rectangle (it needs 4 x 4).
    expect(
      tileRectangleExactCover(Polyomino.fromId("e040"), 4, 2, BUDGET).kind,
    ).toBe("impossible");
  });

  it("stops at the budget", () => {
    expect(
      tileRectangleExactCover(Polyomino.fromId("f040"), 15, 15, 3).kind,
    ).toBe("budget");
  });
});
