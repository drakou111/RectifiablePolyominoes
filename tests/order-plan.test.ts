import { describe, expect, it } from "vitest";
import type { Placement, RectangleSize } from "../src/core/model";
import { orderRecords, type CopyStep } from "../tools/lib/order-plan";

const none = (copies: number, decided = true): CopyStep => ({
  copies,
  found: [],
  decided,
});
const tiled = (
  copies: number,
  sizes: RectangleSize[],
  decided = true,
): CopyStep => ({
  copies,
  found: sizes.map((size) => [size, [] as Placement[]] as const),
  decided,
});

describe("orderRecords", () => {
  it("settles the order and smallest rectangles when every step is decided", () => {
    const records = orderRecords(2, [
      none(2),
      none(3),
      tiled(4, [
        [2, 8],
        [4, 4],
      ]),
    ]);
    expect(records.rectifiable).toMatchObject({
      status: "computed",
      value: true,
    });
    expect(records.order).toMatchObject({ status: "computed", value: 4 });
    expect(records.smallestRectangles?.value).toEqual([
      [2, 8],
      [4, 4],
    ]);
  });

  it("leaves the smallest rectangles out when the winning step is incomplete", () => {
    const records = orderRecords(2, [none(2), tiled(3, [[3, 5]], false)]);
    expect(records.order).toMatchObject({ status: "computed", value: 3 });
    expect(records.smallestRectangles).toBeUndefined();
  });

  it("gives bounds when an earlier step stayed undecided", () => {
    const records = orderRecords(2, [
      none(2),
      none(3, false),
      tiled(4, [[2, 8]]),
    ]);
    expect(records.rectifiable.value).toBe(true);
    expect(records.order).toMatchObject({ status: "open", lower: 3, upper: 4 });
    expect(records.smallestRectangles).toBeUndefined();
  });

  it("keeps rectifiability open when nothing tiles", () => {
    const records = orderRecords(11, [none(11), none(12), none(13, false)]);
    expect(records.rectifiable.status).toBe("open");
    expect(records.order).toMatchObject({ status: "open", lower: 13 });
  });
});
