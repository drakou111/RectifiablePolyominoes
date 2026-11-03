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

interface SweepContext {
  readonly shapes: readonly AnchoredShape[];
  readonly height: number;
  readonly strict: boolean;
  readonly full: number;
}

/**
 * Every way to complete the band cells of the current column (state[0]), lowest empty cell
 * first. Calls onDone with the finished state and the copies placed (anchored at `column`);
 * onDone returns true to stop the enumeration.
 */
function fillColumn(
  context: SweepContext,
  state: Int32Array,
  column: number,
  placed: Placement[],
  onDone: (done: Int32Array, placed: Placement[]) => boolean,
): boolean {
  const { shapes, height, strict, full } = context;
  const current = state[0] as number;
  if (current === full) return onDone(state, placed);
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
    placed.push({ o: shape.o, x: column + shape.left, y: y + shape.top });
    const stop = fillColumn(context, after, column, placed, onDone);
    placed.pop();
    if (stop) return true;
  }
  return false;
}

function shiftColumns(state: Int32Array): Int32Array {
  const shifted = new Int32Array(state.length);
  for (let i = 1; i < state.length; i++) shifted[i - 1] = state[i] as number;
  return shifted;
}

interface StoredState {
  readonly parent: string | undefined;
  /** Placements made in this step, in absolute coordinates (y measured from the bottom wall). */
  readonly placed: Placement[] | undefined;
}

/** A JS Map holds at most 2^24 entries; the sweep keeps every state in one. */
export const MAX_STRIP_STATES = 16_000_000;

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
  if (maxStates > MAX_STRIP_STATES)
    throw new Error(
      `a state limit of ${maxStates} exceeds what one Map holds (at most ${MAX_STRIP_STATES})`,
    );

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

  const context: SweepContext = { shapes, height, strict, full };
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { key, masks, column } of frontier) {
      let result: StripVerdict | undefined;
      fillColumn(context, masks, column, [], (done, placed) => {
        const shifted = shiftColumns(done);
        const nextColumn = column + 1;
        const nextKey = encode(shifted, nextColumn);
        if (seen.has(nextKey)) return false;
        if (seen.size >= maxStates) {
          result = { kind: "limit" };
          return true;
        }
        seen.set(nextKey, {
          parent: key,
          placed: keepTiling ? [...placed] : undefined,
        });
        if (shifted.every((mask) => mask === 0)) {
          result = {
            kind: "reachable",
            width: nextColumn,
            placements: keepTiling ? rebuild(seen, nextKey) : undefined,
          };
          return true;
        }
        next.push({ key: nextKey, masks: shifted, column: nextColumn });
        return false;
      });
      if (result !== undefined) return result;
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

export type InfinitePathVerdict =
  | { readonly kind: "infinite"; readonly states: number }
  | { readonly kind: "finite"; readonly states: number }
  | { readonly kind: "limit" };

/**
 * Does the strict sweep have an infinite path from the start (a reachable cycle)? Such a path is
 * a tiling of a half-strip of width `height`: walls on both long sides and at its end. (Band mode
 * is accepted for completeness, but an infinite band path proves nothing.)
 */
export function sweepInfinitePath(
  polyomino: Polyomino,
  height: number,
  strict: boolean,
  maxStates: number,
): InfinitePathVerdict {
  if (height > 30) throw new Error("band height above 30 is not supported");
  const shapes = anchoredShapes(polyomino);
  const reach = Math.max(polyomino.width, polyomino.height);
  const context: SweepContext = {
    shapes,
    height,
    strict,
    full: (1 << height) - 1,
  };

  const ids = new Map<string, number>();
  const successors: number[][] = [];
  const queue: { masks: Int32Array; column: number }[] = [];
  const intern = (masks: Int32Array, column: number): number | undefined => {
    const key = stripStateKey(masks, Math.min(column, reach));
    const known = ids.get(key);
    if (known !== undefined) return known;
    if (ids.size >= maxStates) return undefined;
    const id = ids.size;
    ids.set(key, id);
    successors.push([]);
    queue.push({ masks, column: Math.min(column, reach) });
    return id;
  };

  intern(new Int32Array(reach), 0);
  for (let current = 0; current < queue.length; current++) {
    const { masks, column } = queue[current] as {
      masks: Int32Array;
      column: number;
    };
    let overflow = false;
    fillColumn(context, masks, column, [], (done) => {
      const id = intern(shiftColumns(done), column + 1);
      if (id === undefined) {
        overflow = true;
        return true;
      }
      const list = successors[current] as number[];
      if (!list.includes(id)) list.push(id);
      return false;
    });
    if (overflow) return { kind: "limit" };
  }

  // Peel off states without successors until none are left (finite) or a cycle core remains.
  const count = successors.length;
  const outDegree = Int32Array.from(successors, (list) => list.length);
  const predecessors: number[][] = Array.from({ length: count }, () => []);
  successors.forEach((list, from) => {
    for (const to of list) predecessors[to]?.push(from);
  });
  const dead: number[] = [];
  for (let id = 0; id < count; id++) if (outDegree[id] === 0) dead.push(id);
  let removed = 0;
  while (dead.length > 0) {
    const id = dead.pop() as number;
    removed++;
    for (const from of predecessors[id] ?? []) {
      const left = (outDegree[from] as number) - 1;
      outDegree[from] = left;
      if (left === 0) dead.push(from);
    }
  }
  return removed === count
    ? { kind: "finite", states: count }
    : { kind: "infinite", states: count };
}

export type HalfStripProof =
  | { readonly kind: "half-strip"; readonly width: number }
  | {
      readonly kind: "no-half-strip";
      readonly bandHeight: number;
      readonly states: number;
    }
  | { readonly kind: "undecided" };

/**
 * Half-strips of width h are decided exactly by the strict sweep. For all widths at once: the
 * band sweep along a wall runs between two perpendicular walls and needs `height` rows of depth,
 * and the end of every half-strip is such a wall. So an unreachable band state rules out
 * half-strips of every width (and hence every rectangle).
 */
export function halfStripProof(
  polyomino: Polyomino,
  maxHeight: number,
  maxStates: number,
): HalfStripProof {
  const minSide = Math.min(polyomino.width, polyomino.height);
  for (let height = minSide; height <= maxHeight; height++) {
    const exact = sweepInfinitePath(polyomino, height, true, maxStates);
    if (exact.kind === "infinite") return { kind: "half-strip", width: height };
    const band = sweepStrip(polyomino, height, false, maxStates);
    if (band.kind === "unreachable")
      return { kind: "no-half-strip", bandHeight: height, states: band.states };
  }
  return { kind: "undecided" };
}
