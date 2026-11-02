import { describe, expect, it } from "vitest";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import { streamFreePolyominoes } from "../src/core/stream-enumerate";

// OEIS A000105 (free polyominoes) and A001419 (free polyominoes with holes).
const FREE_COUNTS = [1, 1, 2, 5, 12, 35, 108, 369, 1285, 4655, 17073];
const HOLED_COUNTS = [0, 0, 0, 0, 0, 0, 1, 6, 37, 195, 979];

describe("streamFreePolyominoes", () => {
  it("yields the same pieces as the full enumeration, with the same IDs and flags", () => {
    const bySize = enumerateFreePolyominoes(9);
    for (let size = 1; size <= 9; size++) {
      const streamed = [...streamFreePolyominoes(size)];
      const expected = (bySize[size - 1] ?? []).map((shape) => ({
        id: shape.id,
        hasHole: shape.hasHole(),
        isRectangle: shape.isRectangle(),
      }));
      const byId = (a: { id: string }, b: { id: string }): number =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      expect(streamed.sort(byId)).toEqual(expected.sort(byId));
    }
  });

  it("matches the known counts, holes included", () => {
    for (let size = 1; size <= FREE_COUNTS.length; size++) {
      let total = 0;
      let holes = 0;
      for (const piece of streamFreePolyominoes(size)) {
        total++;
        if (piece.hasHole) holes++;
      }
      expect([size, total, holes]).toEqual([
        size,
        FREE_COUNTS[size - 1],
        HOLED_COUNTS[size - 1],
      ]);
    }
  });

  it("is deterministic and yields each piece once", () => {
    const first = [...streamFreePolyominoes(8)].map((piece) => piece.id);
    const second = [...streamFreePolyominoes(8)].map((piece) => piece.id);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it("rejects a bad size", () => {
    expect(() => streamFreePolyominoes(0).next()).toThrow(/positive integer/);
  });
});
