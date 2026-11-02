import { describe, expect, it } from "vitest";
import { deriveProperties } from "../src/core/derived";
import { isNotApplicable, type Properties } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";

describe("deriveProperties", () => {
  it("gives a rectangle itself as its only prime rectangle", () => {
    const brick = Polyomino.fromRows(["###", "###"]);
    expect(deriveProperties(brick).primeRectangles?.value).toEqual({
      rectangles: [[2, 3]],
      complete: true,
    });
  });
});

describe("isNotApplicable", () => {
  const nonTiler = {
    rectifiable: { status: "computed", value: false },
  } as Properties;

  it("marks rectangle properties of a non-tiler", () => {
    expect(isNotApplicable("order", nonTiler)).toBe(true);
    expect(isNotApplicable("minColors", nonTiler)).toBe(true);
  });

  it("keeps plane and half-strip properties applicable", () => {
    expect(isNotApplicable("tilesPlane", nonTiler)).toBe(false);
    expect(isNotApplicable("tilesHalfStrip", nonTiler)).toBe(false);
  });

  it("does not mark properties of an open or unknown piece", () => {
    const open = { rectifiable: { status: "open" } } as Properties;
    expect(isNotApplicable("order", open)).toBe(false);
    expect(isNotApplicable("order", {} as Properties)).toBe(false);
  });
});
