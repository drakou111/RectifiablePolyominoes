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
  it("includes hand-entered shapes beyond the generated sizes", () => {
    const catalog = new Catalog(
      new Map([["fe70", { id: "fe70", properties: {} }]]),
      [],
      4,
    );
    expect(catalog.items).toHaveLength(1 + 1 + 2 + 5 + 1);
    expect(catalog.get("fe70")?.size).toBe(10);
    expect(catalog.get("f0")?.properties.order?.value).toBe(1);
  });
});
