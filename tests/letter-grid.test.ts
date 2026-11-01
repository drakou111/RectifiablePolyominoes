import { describe, expect, it } from "vitest";
import { parseLetterGrid } from "../src/core/letter-grid";
import { expandTiling } from "../src/core/tiling";

describe("parseLetterGrid", () => {
  it("round-trips a valid L-tetromino tiling", () => {
    const rows = ["aaab", "abbb"];
    const tiling = parseLetterGrid(rows);
    expect(tiling.polyomino.id).toBe("e080");
    expect([tiling.width, tiling.height]).toEqual([4, 2]);
    expect(tiling.placements).toHaveLength(2);
    const expanded = expandTiling(
      tiling.polyomino,
      tiling.width,
      tiling.height,
      tiling.placements,
    );
    expect(expanded.problems).toEqual([]);
  });

  it("rejects regions of different sizes", () => {
    expect(() => parseLetterGrid(["aaaa", "bbaa"])).toThrow(
      /has 2 cells, expected 6/,
    );
  });

  it("rejects regions of the right size but the wrong shape", () => {
    expect(() => parseLetterGrid(["aab", "abb", "ccc"])).toThrow(
      /not a copy of/,
    );
  });

  it("handles reused characters on non-touching copies", () => {
    const tiling = parseLetterGrid(["abab", "abab"]);
    expect(tiling.polyomino.id).toBe("c0");
    expect(tiling.placements).toHaveLength(4);
  });
});
