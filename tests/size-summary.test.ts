import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/core/catalog";
import type { Properties } from "../src/core/model";
import { catalogueSizes, summarizeSize } from "../src/core/size-summary";

function item(id: string, size: number, properties: object): CatalogItem {
  return { id, size, properties: properties as Properties } as CatalogItem;
}

const tiler = (id: string, order: number): CatalogItem =>
  item(id, 5, {
    rectifiable: { status: "proven", value: true },
    order: { status: "proven", value: order },
  });

describe("summarizeSize", () => {
  const items = [
    tiler("a", 2),
    tiler("b", 10),
    item("c", 5, { rectifiable: { status: "computed", value: false } }),
    item("d", 5, {
      rectifiable: { status: "open" },
      order: { status: "open", lower: 25 },
    }),
    item("e", 5, {}),
    tiler("f", 10),
    item("g", 6, { rectifiable: { status: "computed", value: false } }),
  ];

  it("lists unknown orders first by lower bound, then tilers by order, highest first", () => {
    const summary = summarizeSize(items, 5);
    expect(summary.unknown.map((i) => i.id)).toEqual(["d", "e"]);
    expect(summary.tilers.map((i) => i.id)).toEqual(["b", "f", "a"]);
  });

  it("leaves out other sizes and pieces that tile no rectangle", () => {
    const six = summarizeSize(items, 6);
    expect([six.unknown, six.tilers]).toEqual([[], []]);
    expect(summarizeSize(items, 5).unknown.map((i) => i.id)).not.toContain("c");
  });
});

describe("catalogueSizes", () => {
  it("lists each size once, smallest first", () => {
    expect(
      catalogueSizes([item("x", 7, {}), item("y", 3, {}), item("z", 7, {})]),
    ).toEqual([3, 7]);
  });
});
