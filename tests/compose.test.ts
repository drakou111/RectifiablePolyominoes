import { describe, expect, it } from "vitest";
import {
  assembleTiling,
  rotateTiling,
  tileableRectanglesOfArea,
  type RectangleTiling,
} from "../src/core/compose";
import { tileRectangleExactCover } from "../src/core/exact-cover";
import { Polyomino } from "../src/core/polyomino";
import { PrimeClosure } from "../src/core/prime-closure";
import { expandTiling } from "../src/core/tiling";

const BUDGET = 1_000_000;

function search(polyomino: Polyomino, w: number, h: number): RectangleTiling {
  const result = tileRectangleExactCover(polyomino, w, h, BUDGET);
  if (result.kind !== "found") throw new Error(`no ${w}x${h} tiling`);
  return { width: w, height: h, placements: result.value };
}

const problems = (
  polyomino: Polyomino,
  tiling: RectangleTiling,
): readonly string[] =>
  expandTiling(polyomino, tiling.width, tiling.height, tiling.placements)
    .problems;

describe("rotateTiling", () => {
  it.each(["e080", "f040", "f8c0", "e0c0"])(
    "keeps %s tilings valid through four quarter turns",
    (id) => {
      const polyomino = Polyomino.fromId(id);
      const area = polyomino.size * (id === "e080" ? 2 : 10);
      let tiling: RectangleTiling | undefined;
      for (let w = 2; w * w <= area * 4 && tiling === undefined; w++)
        if (area % w === 0) {
          const r = tileRectangleExactCover(polyomino, w, area / w, BUDGET);
          if (r.kind === "found")
            tiling = { width: w, height: area / w, placements: r.value };
        }
      if (tiling === undefined) throw new Error(`no test tiling for ${id}`);
      let turned = tiling;
      for (let turn = 0; turn < 4; turn++) {
        turned = rotateTiling(polyomino, turned);
        expect(problems(polyomino, turned)).toEqual([]);
      }
      expect(turned.width).toBe(tiling.width);
    },
  );
});

describe("assembleTiling", () => {
  it("glues L-tetromino primes into a 4 x 4 square and a 5 x 8 rectangle", () => {
    const l = Polyomino.fromId("e080");
    const primes = [
      [2, 4],
      [3, 8],
    ] as const;
    const closure = new PrimeClosure(primes, 40);
    const stored = new Map([
      ["2x4", search(l, 2, 4)],
      ["3x8", search(l, 3, 8)],
    ]);
    const source = (w: number, h: number): RectangleTiling | undefined =>
      stored.get(`${w}x${h}`) ?? stored.get(`${h}x${w}`);
    for (const [w, h] of [
      [4, 4],
      [8, 5],
      [4, 2],
    ] as const) {
      const tiling = assembleTiling(l, closure, w, h, source);
      if (tiling === undefined) throw new Error(`no ${w}x${h}`);
      expect([tiling.width, tiling.height]).toEqual([w, h]);
      expect(problems(l, tiling)).toEqual([]);
    }
    expect(assembleTiling(l, closure, 3, 4, source)).toBeUndefined();
  });

  it("lists closure-tileable rectangles of an area", () => {
    const closure = new PrimeClosure(
      [
        [2, 4],
        [3, 8],
      ],
      40,
    );
    expect(tileableRectanglesOfArea(closure, 24)).toEqual([
      [4, 6],
      [3, 8],
      [2, 12],
    ]);
  });
});
