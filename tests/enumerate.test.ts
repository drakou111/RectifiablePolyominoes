import { describe, expect, it } from "vitest";
import { Catalog } from "../src/core/catalog";
import { enumerateFreePolyominoes } from "../src/core/enumerate";

// OEIS A000105 (free polyominoes) and A001419 (free polyominoes with holes).
const FREE_COUNTS = [1, 1, 2, 5, 12, 35, 108, 369, 1285, 4655];
const HOLED_COUNTS = [0, 0, 0, 0, 0, 0, 1, 6, 37, 195];

describe("enumerateFreePolyominoes", () => {
  const bySize = enumerateFreePolyominoes(FREE_COUNTS.length);

  it("matches the known counts of free polyominoes", () => {
    expect(bySize.map((group) => group.length)).toEqual(FREE_COUNTS);
  });

  it("matches the known counts of polyominoes with holes", () => {
    expect(
      bySize.map((group) => group.filter((shape) => shape.hasHole()).length),
    ).toEqual(HOLED_COUNTS);
  });

  it("returns canonical shapes", () => {
    for (const group of bySize)
      for (const shape of group) expect(shape.encode()).toBe(shape.id);
  });
});

describe("Catalog", () => {
  it("holds the entries plus every rectangle up to the complete size", () => {
    const catalog = new Catalog(
      new Map([["fe70", { id: "fe70", properties: {} }]]),
      [],
      4,
    );
    // Rectangles 1x1, 1x2, 1x3, 1x4 and 2x2, then the entry.
    expect(catalog.items.map((item) => item.id).sort()).toEqual([
      "80",
      "c0",
      "c0c0",
      "e0",
      "f0",
      "fe70",
    ]);
    expect(catalog.get("fe70")?.size).toBe(10);
    expect(catalog.get("f0")?.properties.order?.value).toBe(1);
  });
});
