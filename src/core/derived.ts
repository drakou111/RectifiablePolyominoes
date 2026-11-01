import type { Properties } from "./model";
import type { Polyomino } from "./polyomino";

export const HOLE_REASON =
  "It has a hole. Copies cannot cross the piece, so the hole must hold whole copies, and none fit.";
export const RECTANGLE_REASON = "The piece is itself a rectangle.";

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** Facts that follow from other recorded properties. */
export function inferProperties(properties: Properties): Properties {
  if (
    properties.rectifiable?.value !== true ||
    properties.tilesPlane !== undefined
  )
    return {};
  return {
    tilesPlane: {
      status: "proven",
      value: true,
      reason: "It tiles a rectangle, and rectangles tile the plane.",
    },
  };
}

/** Facts that follow from the shape alone, so nobody has to enter them by hand. */
export function deriveProperties(polyomino: Polyomino): Properties {
  if (polyomino.hasHole()) {
    return {
      rectifiable: { status: "proven", value: false, reason: HOLE_REASON },
      tilesPlane: { status: "proven", value: false, reason: HOLE_REASON },
    };
  }
  if (polyomino.isRectangle()) {
    const { width, height } = polyomino;
    const squareSide = (width * height) / greatestCommonDivisor(width, height);
    return {
      rectifiable: { status: "proven", value: true, reason: RECTANGLE_REASON },
      order: { status: "proven", value: 1, reason: RECTANGLE_REASON },
      oddOrder: { status: "proven", value: 1, reason: RECTANGLE_REASON },
      smallestRectangles: {
        status: "proven",
        value: [[width, height]],
        reason: RECTANGLE_REASON,
      },
      smallestSquare: {
        status: "proven",
        value: squareSide,
        reason:
          "A square tiled by a-by-b bricks has a side divisible by both a and b (de Bruijn), so lcm(a, b) is smallest, and it works.",
      },
      tilesPlane: { status: "proven", value: true, reason: RECTANGLE_REASON },
      minColors: {
        status: "proven",
        value: 1,
        reason: "One copy is already a rectangle.",
      },
    };
  }
  return {};
}
