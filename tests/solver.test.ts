import { describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import { cornerTest, smallOrder, tileRectangle } from "../src/core/solver";
import { expandTiling } from "../src/core/tiling";

const BUDGET = 5_000_000;

describe("tileRectangle", () => {
  it("finds valid tilings", () => {
    const y = Polyomino.fromId("f040");
    const result = tileRectangle(y, 5, 10, BUDGET);
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(expandTiling(y, 5, 10, result.value).problems).toEqual([]);
  });

  it("proves small rectangles impossible", () => {
    expect(tileRectangle(Polyomino.fromId("e040"), 2, 4, BUDGET).kind).toBe(
      "impossible",
    );
    expect(tileRectangle(Polyomino.fromId("f040"), 5, 5, BUDGET).kind).toBe(
      "impossible",
    );
  });
});

describe("smallOrder", () => {
  it.each([
    ["c080", 2, [[2, 3]]],
    ["e080", 2, [[2, 4]]],
    ["e040", 4, [[4, 4]]],
    ["f040", 10, [[5, 10]]],
  ])("finds the order of %s", (id, order, rectangles) => {
    const result = smallOrder(Polyomino.fromId(id), 12, BUDGET);
    expect(result).not.toBe("budget");
    if (result === "budget" || result === undefined)
      throw new Error("no order");
    expect(result.order).toBe(order);
    expect(result.smallest.map((s) => [s.width, s.height])).toEqual(rectangles);
  });

  it("reports nothing for pieces that tile no rectangle", () => {
    expect(smallOrder(Polyomino.fromId("c060"), 8, BUDGET)).toBeUndefined();
  });
});

describe("cornerTest", () => {
  it("misses the S tetromino, whose forced staircase leaves any finite corner region", () => {
    expect(cornerTest(Polyomino.fromId("c060"), 6, BUDGET).kind).toBe(
      "fillable",
    );
  });

  it.each(["40e040", "e0a0"])("blocks %s", (id) => {
    expect(cornerTest(Polyomino.fromId(id), 6, BUDGET).kind).toBe("blocked");
  });

  it.each(["e080", "f040", "fe70"])(
    "cannot block the rectifiable or open piece %s",
    (id) => {
      expect(cornerTest(Polyomino.fromId(id), 8, BUDGET).kind).toBe("fillable");
    },
  );
});

describe("tileRectangle with a color limit", () => {
  it("finds a 2-colorable L tetromino tiling", () => {
    expect(tileRectangle(Polyomino.fromId("e080"), 2, 4, BUDGET, 2).kind).toBe(
      "found",
    );
  });

  it("respects a generous color limit", () => {
    expect(tileRectangle(Polyomino.fromId("e040"), 4, 4, BUDGET, 4).kind).toBe(
      "found",
    );
  });
});
