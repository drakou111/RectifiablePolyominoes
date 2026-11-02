import { describe, expect, it } from "vitest";
import type { ExpandedTiling } from "../src/core/tiling";
import { foldStrip } from "../src/ui/render";

const BLANK = -2;

/** A width x height grid whose cell (x, y) holds the piece number 10 * x + y. */
function labelled(width: number, height: number): ExpandedTiling {
  const grid = new Int32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) grid[y * width + x] = 10 * x + y;
  return { width, height, grid, problems: [] };
}

describe("foldStrip", () => {
  it("cuts a wide strip into folds with a blank row between them", () => {
    const folded = foldStrip(labelled(5, 2), 2);
    expect([folded.width, folded.height]).toEqual([2, 8]);
    expect(Array.from(folded.grid)).toEqual([
      0,
      10,
      1,
      11,
      BLANK,
      BLANK,
      20,
      30,
      21,
      31,
      BLANK,
      BLANK,
      40,
      BLANK,
      41,
      BLANK,
    ]);
  });

  it("turns a tall strip a quarter counterclockwise first", () => {
    // 2 wide, 3 tall: the right column becomes the top row.
    const folded = foldStrip(labelled(2, 3), 10);
    expect([folded.width, folded.height]).toEqual([3, 2]);
    expect(Array.from(folded.grid)).toEqual([10, 11, 12, 0, 1, 2]);
  });

  it("keeps every cell exactly once", () => {
    const folded = foldStrip(labelled(7, 37), 5);
    const pieces = Array.from(folded.grid).filter((p) => p !== BLANK);
    expect(pieces.sort((a, b) => a - b)).toEqual(
      Array.from(labelled(7, 37).grid).sort((a, b) => a - b),
    );
  });
});
