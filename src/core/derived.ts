import type { Properties } from "./model";
import type { Polyomino } from "./polyomino";

export const HOLE_REASON =
  "It has a hole. Copies cannot cross the piece, so the hole must hold whole copies, and none fit.";
export const RECTANGLE_REASON = "The piece is itself a rectangle.";

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

const implied = (value: boolean, reason: string) =>
  ({ status: "proven", value, reason }) as const;

/**
 * Facts that follow from other recorded properties, using
 * tiles a rectangle => tiles a half-strip => tiles the plane
 * (stack rectangles into a half-strip; a half-strip tiling yields strip tilings by compactness,
 * and strips stack into the plane).
 */
export function inferProperties(properties: Properties): Properties {
  const result: Record<string, unknown> = {};
  const rectifiable = properties.rectifiable?.value;
  let halfStrip = properties.tilesHalfStrip?.value;
  const plane = properties.tilesPlane?.value;
  if (halfStrip === undefined && rectifiable === true) {
    halfStrip = true;
    result.tilesHalfStrip = implied(
      true,
      "It tiles a rectangle, and rectangles stack into a half-strip.",
    );
  }
  if (halfStrip === undefined && plane === false) {
    halfStrip = false;
    result.tilesHalfStrip = implied(
      false,
      "It does not tile the plane, and every half-strip tiler does.",
    );
  }
  if (plane === undefined && halfStrip === true)
    result.tilesPlane = implied(
      true,
      rectifiable === true
        ? "It tiles a rectangle, and rectangles tile the plane."
        : "It tiles a half-strip; by compactness it tiles a full strip, and strips stack into the plane.",
    );
  if (rectifiable === undefined && halfStrip === false)
    result.rectifiable = implied(
      false,
      "It does not tile a half-strip, and every rectangle tiler does.",
    );
  return result as Properties;
}

/** Facts that follow from the shape alone, so nobody has to enter them by hand. */
export function deriveProperties(polyomino: Polyomino): Properties {
  if (polyomino.hasHole()) {
    return {
      rectifiable: { status: "proven", value: false, reason: HOLE_REASON },
      tilesHalfStrip: { status: "proven", value: false, reason: HOLE_REASON },
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
