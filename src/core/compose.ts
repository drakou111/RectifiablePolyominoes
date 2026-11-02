import type { Placement, RectangleSize } from "./model";
import { ORIENTATION_COUNT, type Polyomino } from "./polyomino";
import type { PrimeClosure } from "./prime-closure";

export interface RectangleTiling {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement[];
}

const cellKey = (shape: Polyomino): string =>
  shape.cells
    .map((cell) => `${cell.x},${cell.y}`)
    .sort()
    .join(";");

/** For each orientation o, an orientation equal to o followed by a clockwise quarter turn. */
function quarterTurnTable(polyomino: Polyomino): number[] {
  const byKey = new Map<string, number>();
  for (let o = ORIENTATION_COUNT - 1; o >= 0; o--)
    byKey.set(cellKey(polyomino.oriented(o)), o);
  const table: number[] = [];
  for (let o = 0; o < ORIENTATION_COUNT; o++) {
    const shape = polyomino.oriented(o);
    const turned = shape.cells
      .map((cell) => `${shape.height - 1 - cell.y},${cell.x}`)
      .sort()
      .join(";");
    const target = byKey.get(turned);
    if (target === undefined)
      throw new Error(`no orientation matches a quarter turn of ${o}`);
    table.push(target);
  }
  return table;
}

/** The same tiling turned a quarter clockwise: width and height swap. */
export function rotateTiling(
  polyomino: Polyomino,
  tiling: RectangleTiling,
): RectangleTiling {
  const turn = quarterTurnTable(polyomino);
  return {
    width: tiling.height,
    height: tiling.width,
    placements: tiling.placements.map((p) => {
      const shapeHeight = polyomino.oriented(p.o).height;
      return {
        o: turn[p.o] as number,
        x: tiling.height - p.y - shapeHeight,
        y: p.x,
      };
    }),
  };
}

/** A stored or searched tiling of exactly width x height (either way round), if one exists. */
export type TilingSource = (
  width: number,
  height: number,
) => RectangleTiling | undefined;

/**
 * Builds a width x height tiling by cutting the rectangle into prime pieces along the closure
 * and gluing tilings of the pieces. `source` supplies tilings of the pieces (any orientation).
 * Returns undefined when no decomposition has a tiling for every piece.
 */
export function assembleTiling(
  polyomino: Polyomino,
  closure: PrimeClosure,
  width: number,
  height: number,
  source: TilingSource,
): RectangleTiling | undefined {
  const memo = new Map<string, RectangleTiling | null>();

  const fit = (
    tiling: RectangleTiling,
    w: number,
    h: number,
  ): RectangleTiling =>
    tiling.width === w && tiling.height === h
      ? tiling
      : rotateTiling(polyomino, tiling);

  const build = (w: number, h: number): RectangleTiling | undefined => {
    const key = `${w}x${h}`;
    const known = memo.get(key);
    if (known !== undefined) return known ?? undefined;
    memo.set(key, null);
    let result: RectangleTiling | undefined;
    const direct = source(w, h);
    if (direct !== undefined) result = fit(direct, w, h);
    for (let cut = 1; cut <= w - cut && result === undefined; cut++) {
      if (!closure.isTileable(cut, h) || !closure.isTileable(w - cut, h))
        continue;
      const left = build(cut, h);
      const right = left && build(w - cut, h);
      if (left && right)
        result = {
          width: w,
          height: h,
          placements: [
            ...left.placements,
            ...right.placements.map((p) => ({ ...p, x: p.x + cut })),
          ],
        };
    }
    for (let cut = 1; cut <= h - cut && result === undefined; cut++) {
      if (!closure.isTileable(w, cut) || !closure.isTileable(w, h - cut))
        continue;
      const top = build(w, cut);
      const bottom = top && build(w, h - cut);
      if (top && bottom)
        result = {
          width: w,
          height: h,
          placements: [
            ...top.placements,
            ...bottom.placements.map((p) => ({ ...p, y: p.y + cut })),
          ],
        };
    }
    memo.set(key, result ?? null);
    return result;
  };

  if (!closure.isTileable(width, height)) return undefined;
  return build(width, height);
}

/** Rectangles of the given area whose tileability the closure confirms, smallest long side first. */
export function tileableRectanglesOfArea(
  closure: PrimeClosure,
  area: number,
): RectangleSize[] {
  const found: RectangleSize[] = [];
  for (
    let w = Math.ceil(Math.sqrt(area));
    w <= Math.min(area, closure.limit);
    w++
  )
    if (
      area % w === 0 &&
      area / w <= closure.limit &&
      closure.isTileable(area / w, w)
    )
      found.push([area / w, w]);
  return found;
}
