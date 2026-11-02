import { describe, expect, it } from "vitest";
import { Catalog, parseTilingPath } from "../src/core/catalog";
import type { PolyominoEntry } from "../src/core/model";
import { groupTilings } from "../src/core/tiling-groups";

const L_TETROMINO: PolyominoEntry = {
  id: "e080",
  properties: {
    rectifiable: { status: "proven", value: true, ref: "x" },
    order: { status: "proven", value: 2, ref: "x" },
    smallestRectangles: { status: "proven", value: [[2, 4]], ref: "x" },
    smallestSquare: { status: "proven", value: 4, ref: "x" },
    primeRectangles: {
      status: "proven",
      value: {
        rectangles: [
          [2, 4],
          [3, 8],
        ],
        complete: true,
      },
      ref: "x",
    },
    minColors: {
      status: "open",
      upper: 3,
      note: "Upper bound from the stored 8x3 tiling.",
    },
  },
};

function groupsFor(paths: string[]) {
  const catalog = new Catalog(
    new Map([[L_TETROMINO.id, L_TETROMINO]]),
    paths.map(parseTilingPath),
    4,
  );
  const item = catalog.get("e080");
  if (item === undefined) throw new Error("missing test item");
  return groupTilings(item);
}

describe("groupTilings", () => {
  it("puts each tiling under the properties it shows, in table order", () => {
    const groups = groupsFor([
      "tilings/e080/4x2.json",
      "tilings/e080/3x8.json",
      "tilings/e080/5x4.json",
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      "smallestRectangles",
      "smallestSquare",
      "minColors",
      "primeRectangles",
      "other",
    ]);
    const byKey = new Map(groups.map((g) => [g.key, g]));
    expect(byKey.get("smallestRectangles")?.slots[0]?.ref?.path).toBe(
      "tilings/e080/4x2.json",
    );
    // The square has no stored tiling: a placeholder slot.
    expect(byKey.get("smallestSquare")?.slots[0]?.ref).toBeUndefined();
    // The colors bound names the 8x3 tiling, stored as 3x8.
    expect(byKey.get("minColors")?.slots[0]?.ref?.path).toBe(
      "tilings/e080/3x8.json",
    );
    expect(byKey.get("primeRectangles")?.slots.map((s) => s.caption)).toEqual([
      "2 x 4, 2 copies",
      "3 x 8, 6 copies",
    ]);
    expect(byKey.get("other")?.slots.map((s) => s.ref?.path)).toEqual([
      "tilings/e080/5x4.json",
    ]);
  });

  it("prefers a labelled tiling for the fewest colors", () => {
    const groups = groupsFor([
      "tilings/e080/3x8.json",
      "tilings/e080/4x6-3colors.json",
    ]);
    const colors = groups.find((g) => g.key === "minColors");
    expect(colors?.slots[0]?.ref?.label).toBe("3colors");
  });

  it("parses labels from tiling paths", () => {
    expect(parseTilingPath("tilings/e080/4x2-odd.json").label).toBe("odd");
    expect(parseTilingPath("tilings/e080/4x2.json").label).toBeUndefined();
  });
});
