import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/core/catalog";
import type { Properties } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { leadSummary, summarizeProperty } from "../src/ui/format";

const item = (id: string, properties: Properties): CatalogItem =>
  ({
    id,
    polyomino: Polyomino.fromId(id),
    properties,
  }) as unknown as CatalogItem;

describe("summarizeProperty", () => {
  it("counts prime rectangles instead of listing them", () => {
    const record = {
      status: "open",
      value: {
        rectangles: [
          [2, 10],
          [11, 120],
        ],
        complete: false,
      },
    } as const;
    expect(summarizeProperty("primeRectangles", record)).toBe(
      "2 rectangles (list may be incomplete)",
    );
    expect(summarizeProperty("order", { status: "computed", value: 10 })).toBe(
      "10",
    );
  });
});

describe("leadSummary", () => {
  it("states the order and smallest rectangles", () => {
    expect(
      leadSummary(
        item("f040", {
          rectifiable: { status: "proven", value: true },
          order: { status: "proven", value: 10 },
          smallestRectangles: { status: "proven", value: [[10, 5]] },
        } as Properties),
      ),
    ).toBe("Order 10: the smallest rectangle is 5 x 10.");
  });

  it("covers rectangles, non-tilers and open cases", () => {
    expect(leadSummary(item("f0", {} as Properties))).toBe(
      "The piece is itself a rectangle.",
    );
    expect(
      leadSummary(
        item("40e040", {
          rectifiable: { status: "computed", value: false },
        } as Properties),
      ),
    ).toBe("Copies tile no rectangle.");
    expect(
      leadSummary(
        item("f8e060", {
          rectifiable: { status: "open" },
          order: { status: "open", lower: 477 },
        } as Properties),
      ),
    ).toBe(
      "Not known whether copies tile any rectangle; a rectangle would need at least 477 copies.",
    );
  });
});
