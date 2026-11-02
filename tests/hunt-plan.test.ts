import { describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import { huntCandidates, nextRecord } from "../tools/lib/hunt-plan";

describe("huntCandidates", () => {
  const y = Polyomino.fromId("f040"); // Y pentomino, 4 x 2

  it("lists odd copy counts with every rectangle that holds a copy", () => {
    const steps = huntCandidates(y, "odd", 8, undefined, 11);
    expect(steps.map((s) => s.step)).toEqual([9, 11]);
    // 9 copies = 45 cells: 1 x 45 holds no copy, 3 x 15 and 5 x 9 do.
    expect(steps[0]?.rectangles).toEqual([
      [3, 15],
      [5, 9],
    ]);
    expect(steps[1]?.rectangles).toEqual([[5, 11]]);
  });

  it("stops below a known upper bound", () => {
    expect(huntCandidates(y, "odd", 9, 13, 99).map((s) => s.step)).toEqual([
      9, 11,
    ]);
  });

  it("lists square sides, empty when the area is not a multiple of the size", () => {
    const steps = huntCandidates(y, "square", 9, undefined, 11);
    expect(steps).toEqual([
      { step: 9, area: 81, rectangles: [] },
      { step: 10, area: 100, rectangles: [[10, 10]] },
      { step: 11, area: 121, rectangles: [] },
    ]);
  });
});

describe("nextRecord", () => {
  const open = {
    status: "open",
    lower: 9,
    note: "x",
  } as const;

  it("climbs the lower bound over contiguous ruled-out steps only", () => {
    expect(nextRecord("odd", open, [9, 11, 15], undefined)).toMatchObject({
      status: "open",
      lower: 13,
    });
    expect(nextRecord("square", open, [9, 10, 12], undefined)).toMatchObject({
      status: "open",
      lower: 11,
    });
  });

  it("returns the same record when nothing changed", () => {
    expect(nextRecord("odd", open, [11], undefined)).toBe(open);
  });

  it("settles the value when the found step meets the lower bound", () => {
    expect(nextRecord("odd", open, [9, 11], 13)).toEqual({
      status: "computed",
      value: 13,
      ref: "site-solver",
      reason:
        "A stored tiling has 13 copies, and every rectangle holding fewer odd copies was ruled out by exhaustive search.",
    });
    expect(nextRecord("square", open, [], 9)).toMatchObject({
      status: "computed",
      value: 9,
    });
  });

  it("keeps an open record with both bounds when a gap remains", () => {
    expect(nextRecord("odd", open, [], 21)).toMatchObject({
      status: "open",
      lower: 9,
      upper: 21,
      ref: "site-solver",
    });
  });

  it("keeps a reference's upper bound and its source", () => {
    const reid = {
      status: "open",
      lower: 9,
      upper: 15,
      ref: "reid-rectifiable-data",
      refDetail: "x.html",
      untraced: true,
    } as const;
    expect(nextRecord("odd", reid, [9], undefined)).toMatchObject({
      status: "open",
      lower: 11,
      upper: 15,
      ref: "reid-rectifiable-data",
    });
    // A larger find than the reference's does not replace it.
    expect(nextRecord("odd", reid, [], 21)).toBe(reid);
    expect(nextRecord("odd", reid, [9, 11, 13], undefined)).toMatchObject({
      status: "computed",
      value: 15,
      ref: "reid-rectifiable-data",
    });
  });

  it("rejects records that are not open with a lower bound", () => {
    expect(() =>
      nextRecord("odd", { status: "computed", value: 9 }, [], 9),
    ).toThrow();
  });
});
