import { describe, expect, it } from "vitest";
import { sortItems, standing } from "../src/core/browse-query";
import type { CatalogItem } from "../src/core/catalog";
import type { Properties } from "../src/core/model";

function item(id: string, size: number, properties: Properties): CatalogItem {
  return {
    id,
    size,
    properties,
    tilings: [],
    symmetry: "none",
  } as unknown as CatalogItem;
}

const computed = (value: unknown) => ({ status: "computed", value }) as const;

describe("standing", () => {
  it("tells answers, values, open records, missing data and n/a apart", () => {
    const tiler = item("a", 4, {
      rectifiable: computed(true),
      order: computed(2),
      tilesPlane: computed(true),
    } as Properties);
    const nonTiler = item("b", 5, {
      rectifiable: computed(false),
      tilesPlane: computed(false),
    } as Properties);
    const open = item("c", 10, {
      rectifiable: { status: "open" },
      order: { status: "open", lower: 25 },
    } as Properties);
    expect(standing(tiler, "rectifiable")).toBe("yes");
    expect(standing(nonTiler, "tilesPlane")).toBe("no");
    expect(standing(tiler, "order")).toBe("value");
    expect(standing(open, "order")).toBe("open");
    expect(standing(tiler, "minColors")).toBe("none");
    // Rectangle properties of a piece that tiles no rectangle are undefined, not missing.
    expect(standing(nonTiler, "order")).toBe("na");
    expect(standing(nonTiler, "tilesHalfStrip")).toBe("none");
  });
});

describe("sortItems", () => {
  const items = [
    item("p", 6, { order: computed(10) } as Properties),
    item("q", 4, { order: { status: "open", lower: 30 } } as Properties),
    item("r", 5, { order: computed(2) } as Properties),
    item("s", 4, {} as Properties),
    item("t", 7, { order: { status: "open", lower: 20 } } as Properties),
  ];
  const ids = (list: readonly CatalogItem[]): string[] => list.map((i) => i.id);

  it("sorts values, then open records by bound, then missing data", () => {
    expect(ids(sortItems(items, "order", false))).toEqual([
      "r",
      "p",
      "t",
      "q",
      "s",
    ]);
  });

  it("reverses values but keeps open and missing rows last", () => {
    expect(ids(sortItems(items, "order", true))).toEqual([
      "p",
      "r",
      "t",
      "q",
      "s",
    ]);
  });

  it("keeps catalogue order on ties and sorts the piece's own columns", () => {
    expect(ids(sortItems(items, "size", false))).toEqual([
      "q",
      "s",
      "r",
      "p",
      "t",
    ]);
    expect(ids(sortItems(items, "id", true))).toEqual([
      "t",
      "s",
      "r",
      "q",
      "p",
    ]);
  });

  it("puts yes before no, and no first when reversed", () => {
    const plane = [
      item("x", 1, { tilesPlane: computed(false) } as Properties),
      item("y", 1, { tilesPlane: computed(true) } as Properties),
      item("z", 1, {} as Properties),
    ];
    expect(ids(sortItems(plane, "tilesPlane", false))).toEqual(["y", "x", "z"]);
    expect(ids(sortItems(plane, "tilesPlane", true))).toEqual(["x", "y", "z"]);
  });
});
