import type { Placement } from "./model";
import type { Polyomino } from "./polyomino";

/** One distinct orientation, as flat cell offsets. */
interface Shape {
  readonly o: number;
  readonly width: number;
  readonly height: number;
  readonly xs: Int32Array;
  readonly ys: Int32Array;
  /** Column of the first cell in the top row (the anchor used by the rectangle search). */
  readonly anchorX: number;
}

export type SearchResult<T> =
  | { readonly kind: "found"; readonly value: T }
  | { readonly kind: "impossible" }
  | { readonly kind: "budget" };

function distinctShapes(polyomino: Polyomino): Shape[] {
  return polyomino.distinctOrientations().map((o) => {
    const shape = polyomino.oriented(o);
    const xs = Int32Array.from(shape.cells, (cell) => cell.x);
    const ys = Int32Array.from(shape.cells, (cell) => cell.y);
    const anchorX = shape.cells.find((cell) => cell.y === 0)?.x ?? 0;
    return { o, width: shape.width, height: shape.height, xs, ys, anchorX };
  });
}

/**
 * Exhaustive search for a tiling of a width x height rectangle. Fills the first empty cell
 * in row-major order; the copy covering it must have that cell as its own first cell.
 */
export function tileRectangle(
  polyomino: Polyomino,
  width: number,
  height: number,
  stepBudget: number,
  colorLimit?: number,
): SearchResult<Placement[]> {
  const area = width * height;
  if (area % polyomino.size !== 0) return { kind: "impossible" };
  const shapes = distinctShapes(polyomino).filter(
    (s) => s.width <= width && s.height <= height,
  );
  const grid = new Uint8Array(area);
  const placements: Placement[] = [];
  let steps = 0;

  const fits = (shape: Shape, left: number, top: number): boolean => {
    if (left < 0 || left + shape.width > width || top + shape.height > height)
      return false;
    for (let i = 0; i < shape.xs.length; i++)
      if (
        grid[
          (top + (shape.ys[i] as number)) * width +
            left +
            (shape.xs[i] as number)
        ]
      )
        return false;
    return true;
  };
  const mark = (
    shape: Shape,
    left: number,
    top: number,
    value: number,
  ): void => {
    for (let i = 0; i < shape.xs.length; i++)
      grid[
        (top + (shape.ys[i] as number)) * width + left + (shape.xs[i] as number)
      ] = value;
  };

  // With a color limit, every copy also gets a color, and copies sharing an edge must differ.
  const touchesColor = (
    shape: Shape,
    left: number,
    top: number,
    value: number,
  ): boolean => {
    for (let i = 0; i < shape.xs.length; i++) {
      const cx = left + (shape.xs[i] as number);
      const cy = top + (shape.ys[i] as number);
      if (cx > 0 && grid[cy * width + cx - 1] === value) return true;
      if (cx + 1 < width && grid[cy * width + cx + 1] === value) return true;
      if (cy > 0 && grid[(cy - 1) * width + cx] === value) return true;
      if (cy + 1 < height && grid[(cy + 1) * width + cx] === value) return true;
    }
    return false;
  };

  const search = (from: number, colorsUsed: number): boolean | "budget" => {
    let cell = from;
    while (cell < area && grid[cell]) cell++;
    if (cell === area) return true;
    if (++steps > stepBudget) return "budget";
    const x = cell % width;
    const y = (cell - x) / width;
    for (const shape of shapes) {
      const left = x - shape.anchorX;
      if (!fits(shape, left, y)) continue;
      // Colors are interchangeable, so a new color is only ever the next unused one.
      const choices =
        colorLimit === undefined ? 1 : Math.min(colorLimit, colorsUsed + 1);
      for (let color = 0; color < choices; color++) {
        const value = color + 1;
        if (colorLimit !== undefined && touchesColor(shape, left, y, value))
          continue;
        mark(shape, left, y, value);
        placements.push({ o: shape.o, x: left, y });
        const result = search(cell + 1, Math.max(colorsUsed, color + 1));
        if (result !== false) return result;
        placements.pop();
        mark(shape, left, y, 0);
      }
    }
    return false;
  };

  const result = search(0, 0);
  if (result === "budget") return { kind: "budget" };
  return result ? { kind: "found", value: placements } : { kind: "impossible" };
}

/**
 * Can the corner region of a rectangle be filled? Corner at (0, 0); walls at x = wallX and
 * y = wallY (Infinity = no wall within reach). Every cell with x < min(wallX, depth) and
 * y < min(wallY, depth) must be covered by copies lying inside the walls; copies may reach
 * past the region. "impossible" for every possible pair of walls proves the piece tiles no rectangle.
 */
export function fillCorner(
  polyomino: Polyomino,
  depth: number,
  wallX: number,
  wallY: number,
  stepBudget: number,
): SearchResult<true> {
  const shapes = distinctShapes(polyomino);
  const reach = depth + Math.max(polyomino.width, polyomino.height);
  const limitX = Math.min(wallX, reach);
  const limitY = Math.min(wallY, reach);
  const regionX = Math.min(wallX, depth);
  const regionY = Math.min(wallY, depth);
  const grid = new Uint8Array(limitX * limitY);
  let steps = 0;

  const fits = (shape: Shape, left: number, top: number): boolean => {
    if (
      left < 0 ||
      top < 0 ||
      left + shape.width > limitX ||
      top + shape.height > limitY
    )
      return false;
    for (let i = 0; i < shape.xs.length; i++)
      if (
        grid[
          (top + (shape.ys[i] as number)) * limitX +
            left +
            (shape.xs[i] as number)
        ]
      )
        return false;
    return true;
  };
  const mark = (
    shape: Shape,
    left: number,
    top: number,
    value: number,
  ): void => {
    for (let i = 0; i < shape.xs.length; i++)
      grid[
        (top + (shape.ys[i] as number)) * limitX +
          left +
          (shape.xs[i] as number)
      ] = value;
  };

  const search = (from: number): boolean | "budget" => {
    let index = from;
    const regionArea = regionX * regionY;
    while (
      index < regionArea &&
      grid[Math.floor(index / regionX) * limitX + (index % regionX)]
    )
      index++;
    if (index === regionArea) return true;
    if (++steps > stepBudget) return "budget";
    const x = index % regionX;
    const y = (index - x) / regionX;
    // Any cell of any orientation may land on (x, y): copies can stick out of the region.
    for (const shape of shapes) {
      for (let i = 0; i < shape.xs.length; i++) {
        const left = x - (shape.xs[i] as number);
        const top = y - (shape.ys[i] as number);
        if (!fits(shape, left, top)) continue;
        mark(shape, left, top, 1);
        const result = search(index + 1);
        if (result !== false) return result;
        mark(shape, left, top, 0);
      }
    }
    return false;
  };

  const result = search(0);
  if (result === "budget") return { kind: "budget" };
  return result ? { kind: "found", value: true } : { kind: "impossible" };
}

export type CornerVerdict =
  | { readonly kind: "blocked"; readonly depth: number }
  | { readonly kind: "fillable" }
  | { readonly kind: "budget" };

/**
 * Tries every rectangle size near the corner: walls closer than `depth` on either side, or
 * none. Rectangles whose finite sides give an area not divisible by the piece size are skipped.
 * By the 8 symmetries only wallX <= wallY is needed.
 */
export function cornerTest(
  polyomino: Polyomino,
  depth: number,
  stepBudget: number,
): CornerVerdict {
  const walls = [
    Infinity,
    ...Array.from({ length: depth - 1 }, (_, i) => i + 1),
  ];
  let budgetHit = false;
  for (const wallX of walls) {
    for (const wallY of walls) {
      if (wallX > wallY) continue;
      if (Number.isFinite(wallY) && (wallX * wallY) % polyomino.size !== 0)
        continue;
      const result = fillCorner(polyomino, depth, wallX, wallY, stepBudget);
      if (result.kind === "found") return { kind: "fillable" };
      if (result.kind === "budget") budgetHit = true;
    }
  }
  return budgetHit ? { kind: "budget" } : { kind: "blocked", depth };
}

export interface OrderResult {
  readonly order: number;
  readonly smallest: {
    readonly width: number;
    readonly height: number;
    readonly placements: Placement[];
  }[];
}

/**
 * The order, if it is at most maxCopies: every rectangle holding k copies is searched exhaustively,
 * for k = 2, 3, ... The first k with a tiling is the order, provided no smaller search ran out of budget.
 * Returns undefined if no tiling exists up to maxCopies, "budget" if a search was cut short.
 */
export function smallOrder(
  polyomino: Polyomino,
  maxCopies: number,
  stepBudget: number,
): OrderResult | "budget" | undefined {
  const n = polyomino.size;
  const minSide = Math.min(polyomino.width, polyomino.height);
  for (let copies = 2; copies <= maxCopies; copies++) {
    const area = copies * n;
    const smallest: OrderResult["smallest"][number][] = [];
    for (let width = minSide; width * width <= area; width++) {
      if (area % width !== 0) continue;
      const height = area / width;
      // Rows run along the short side: fewer choices per step.
      const result = tileRectangle(polyomino, width, height, stepBudget);
      if (result.kind === "budget") return "budget";
      if (result.kind === "found")
        smallest.push({ width, height, placements: result.value });
    }
    if (smallest.length > 0) return { order: copies, smallest };
  }
  return undefined;
}
