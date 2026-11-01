import { describe, expect, it } from "vitest";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import { coverSquare, periodicTiling } from "../src/core/plane";
import { Polyomino } from "../src/core/polyomino";

const BUDGET = 2_000_000;

describe("plane tilings", () => {
  it.each(["c060", "40e040", "e0a0", "fe70"])(
    "finds a periodic tiling of %s",
    (id) => {
      expect(typeof periodicTiling(Polyomino.fromId(id), 4, BUDGET)).toBe(
        "object",
      );
    },
  );

  it("finds a periodic tiling for exactly the 104 heptominoes that tile the plane", () => {
    // 108 heptominoes: one has a hole and 3 more do not tile the plane (OEIS A057786: 4 non-tilers).
    const heptominoes = enumerateFreePolyominoes(7)[6] ?? [];
    const tilers = heptominoes.filter(
      (shape) => typeof periodicTiling(shape, 4, BUDGET) === "object",
    );
    expect(tilers).toHaveLength(104);
  });

  it("never rules out a piece with a periodic tiling", () => {
    for (const id of ["c060", "e0a0", "f040", "fe70"])
      for (const side of [4, 6, 8])
        expect(coverSquare(Polyomino.fromId(id), side, BUDGET).kind).toBe(
          "found",
        );
  });
});
