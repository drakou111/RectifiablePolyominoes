import type { Placement } from "./model";
import type { Polyomino } from "./polyomino";

/**
 * Column sweep along one wall of a rectangle (drawn as the top wall, rows counted away from it),
 * starting at its left wall.
 *
 * The state is the occupancy of the lowest `height` rows ("the band") in the next few columns.
 * Each step completes the band cells of the current column, filling the lowest empty cell first.
 *
 * - Strict mode (hard top wall at `height`): exact. Returning to the empty state after W >= 1
 *   columns is a tiling of a height x W rectangle.
 * - Band mode (no top wall): cells above the band are ignored, which only allows more. Every
 *   rectangle of height >= `height` gives a path back to the empty state, so if that state is
 *   unreachable, no rectangle of height >= `height` exists, for any width.
 */

export type StripVerdict =
  | { readonly kind: "unreachable"; readonly states: number }
  | {
      readonly kind: "reachable";
      readonly width: number;
      readonly placements: Placement[] | undefined;
    }
  | { readonly kind: "limit" };

/**
 * State key: the column tag, then two UTF-16 units per column mask. A single unit holds only
 * 16 bits; colliding keys would merge different states and make the sweep unsound.
 */
export function stripStateKey(masks: Int32Array, columnTag: number): string {
  const units = [columnTag];
  for (const mask of masks) units.push(mask & 0xffff, mask >>> 16);
  return String.fromCharCode(...units);
}

interface AnchoredShape {
  readonly o: number;
  /** Cell offsets relative to the anchor cell, which lands on the cell being filled. */
  readonly dx: Int32Array;
  readonly dy: Int32Array;
  /** Offset of the shape's bounding box corner relative to the anchor. */
  readonly left: number;
  readonly top: number;
}

function anchoredShapes(polyomino: Polyomino): AnchoredShape[] {
  const result: AnchoredShape[] = [];
  for (const o of polyomino.distinctOrientations()) {
    const shape = polyomino.oriented(o);
    for (const anchor of shape.cells) {
      result.push({
        o,
        dx: Int32Array.from(shape.cells, (cell) => cell.x - anchor.x),
        dy: Int32Array.from(shape.cells, (cell) => cell.y - anchor.y),
        left: -anchor.x,
        top: -anchor.y,
      });
    }
  }
  return result;
}

interface StoredState {
  readonly parent: string | undefined;
  /** Placements made in this step, in absolute coordinates (y measured from the bottom wall). */
  readonly placed: Placement[] | undefined;
}

export function sweepStrip(
  polyomino: Polyomino,
  height: number,
  strict: boolean,
  maxStates: number,
  keepTiling = strict,
): StripVerdict {
  const shapes = anchoredShapes(polyomino);
  const reach = Math.max(polyomino.width, polyomino.height);
  const full = (1 << height) - 1;
  if (height > 30) throw new Error("band height above 30 is not supported");

  // Key: columns c..c+reach-1 as char codes, plus min(c, reach) for the left wall.
  const encode = (masks: Int32Array, column: number): string =>
    stripStateKey(masks, Math.min(column, reach));

  const seen = new Map<string, StoredState>();
  const start = new Int32Array(reach);
  const startKey = encode(start, 0);
  seen.set(startKey, {
    parent: undefined,
    placed: keepTiling ? [] : undefined,
  });
  let frontier: { key: string; masks: Int32Array; column: number }[] = [
    { key: startKey, masks: start, column: 0 },
  ];

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { key, masks, column } of frontier) {
      const placed: Placement[] = [];
      let hitLimit = false;
      let found: StripVerdict | undefined;

      const fill = (state: Int32Array): void => {
        if (hitLimit || found !== undefined) return;
        const current = state[0] as number;
        if (current === full) {
          const shifted = new Int32Array(reach);
          for (let i = 1; i < reach; i++) shifted[i - 1] = state[i] as number;
          const nextColumn = column + 1;
          const nextKey = encode(shifted, nextColumn);
          if (seen.has(nextKey)) return;
          if (seen.size >= maxStates) {
            hitLimit = true;
            return;
          }
          seen.set(nextKey, {
            parent: key,
            placed: keepTiling ? [...placed] : undefined,
          });
          if (shifted.every((mask) => mask === 0)) {
            found = {
              kind: "reachable",
              width: nextColumn,
              placements: keepTiling ? rebuild(seen, nextKey) : undefined,
            };
            return;
          }
          next.push({ key: nextKey, masks: shifted, column: nextColumn });
          return;
        }
        let y = 0;
        while ((current >> y) & 1) y++;
        for (const shape of shapes) {
          let ok = true;
          for (let i = 0; i < shape.dx.length && ok; i++) {
            const rel = shape.dx[i] as number;
            const row = y + (shape.dy[i] as number);
            if (row < 0 || column + rel < 0) ok = false;
            else if (row >= height) ok = !strict;
            else if (rel < 0)
              ok = false; // band cells of finished columns are taken
            else if (((state[rel] as number) >> row) & 1) ok = false;
          }
          if (!ok) continue;
          const after = Int32Array.from(state);
          for (let i = 0; i < shape.dx.length; i++) {
            const row = y + (shape.dy[i] as number);
            if (row < height)
              after[shape.dx[i] as number] =
                (after[shape.dx[i] as number] as number) | (1 << row);
          }
          if (keepTiling)
            placed.push({
              o: shape.o,
              x: column + shape.left,
              y: y + shape.top,
            });
          fill(after);
          if (keepTiling) placed.pop();
          if (hitLimit || found !== undefined) return;
        }
      };

      fill(masks);
      if (found !== undefined) return found;
      if (hitLimit) return { kind: "limit" };
    }
    frontier = next;
  }
  return { kind: "unreachable", states: seen.size };
}

function rebuild(
  seen: ReadonlyMap<string, StoredState>,
  endKey: string,
): Placement[] {
  const steps: Placement[][] = [];
  let key: string | undefined = endKey;
  while (key !== undefined) {
    const state = seen.get(key) as StoredState;
    steps.push(state.placed ?? []);
    key = state.parent;
  }
  return steps.reverse().flat();
}

export type StripProof =
  | {
      readonly kind: "no-rectangle";
      readonly bandHeight: number;
      readonly states: number;
    }
  | {
      readonly kind: "rectangle";
      readonly width: number;
      readonly height: number;
      readonly placements: Placement[];
    }
  | { readonly kind: "undecided" };

/**
 * For h = 1, 2, ..., maxHeight: an exact search for rectangles of height h (any width), then the
 * band test of height h. The band test failing after all smaller heights were excluded proves
 * that the piece tiles no rectangle.
 */
export function stripProof(
  polyomino: Polyomino,
  maxHeight: number,
  maxStates: number,
): StripProof {
  const minSide = Math.min(polyomino.width, polyomino.height);
  for (let height = minSide; height <= maxHeight; height++) {
    const exact = sweepStrip(polyomino, height, true, maxStates);
    if (exact.kind === "reachable" && exact.placements !== undefined)
      return {
        kind: "rectangle",
        width: exact.width,
        height,
        placements: exact.placements,
      };
    const band = sweepStrip(polyomino, height, false, maxStates);
    if (band.kind === "unreachable")
      return { kind: "no-rectangle", bandHeight: height, states: band.states };
  }
  return { kind: "undecided" };
}
