import type { Placement, RectangleSize } from "../../src/core/model";
import type { Polyomino } from "../../src/core/polyomino";
import { tileRectangleNative } from "./native-tiler";

export type OrderSearch =
  | {
      readonly kind: "settled";
      readonly copies: number;
      /** Narrow side first; the tilings come back long side first (width = long side). */
      readonly found: readonly (readonly [RectangleSize, Placement[]])[];
    }
  /** Some rectangle at or below the answer ran out of budget. */
  | { readonly kind: "undecided" }
  | { readonly kind: "none" };

/**
 * The order of a non-rectangular piece up to `maxCopies`: for k = 2, 3, ... every rectangle of
 * area k * size that holds a copy is searched to the end; the first k with a tiling wins.
 */
export async function searchOrder(
  shape: Polyomino,
  maxCopies: number,
  budget: number,
): Promise<OrderSearch> {
  const short = Math.min(shape.width, shape.height);
  const long = Math.max(shape.width, shape.height);
  for (let copies = 2; copies <= maxCopies; copies++) {
    const area = copies * shape.size;
    const found: [RectangleSize, Placement[]][] = [];
    for (let a = short; a * a <= area; a++) {
      if (area % a !== 0 || area / a < long) continue;
      const result = await tileRectangleNative(shape, a, area / a, {
        budget,
        cacheMegabytes: 512,
        pocketLimit: 2,
        seed: 0,
      });
      if (result.kind === "budget") return { kind: "undecided" };
      if (result.kind === "found")
        found.push([[a, area / a], result.placements]);
    }
    if (found.length > 0) return { kind: "settled", copies, found };
  }
  return { kind: "none" };
}
