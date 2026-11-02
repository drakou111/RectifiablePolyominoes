import { describe, expect, it } from "vitest";
import type { ExpandedTiling } from "../src/core/tiling";
import { longSideHorizontal } from "../src/ui/render";

/** A width x height grid whose cell (x, y) holds the piece number 10 * x + y. */
function labelled(width: number, height: number): ExpandedTiling {
  const grid = new Int32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) grid[y * width + x] = 10 * x + y;
  return { width, height, grid, problems: [] };
}

describe("longSideHorizontal", () => {
  it("leaves a wide grid as it is", () => {
    const wide = labelled(5, 2);
    expect(longSideHorizontal(wide).grid).toBe(wide.grid);
  });

  it("turns a tall grid a quarter counterclockwise", () => {
    // 2 wide, 3 tall: the right column becomes the top row.
    const turned = longSideHorizontal(labelled(2, 3));
    expect([turned.width, turned.height]).toEqual([3, 2]);
    expect(Array.from(turned.grid)).toEqual([10, 11, 12, 0, 1, 2]);
  });
});
