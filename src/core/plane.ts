import type { Polyomino } from "./polyomino";
import type { SearchResult } from "./solver";

/** A periodic plane tiling: copies of the piece placed on the torus Z^2 / <(a, 0), (b, c)>. */
export interface PeriodicTiling {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  /** Placements in fundamental-domain coordinates (0 <= x < a, 0 <= y < c). */
  readonly placements: { o: number; x: number; y: number }[];
}

interface Shape {
  readonly o: number;
  readonly xs: Int32Array;
  readonly ys: Int32Array;
}

function shapesOf(polyomino: Polyomino): Shape[] {
  return polyomino.distinctOrientations().map((o) => {
    const shape = polyomino.oriented(o);
    return {
      o,
      xs: Int32Array.from(shape.cells, (cell) => cell.x),
      ys: Int32Array.from(shape.cells, (cell) => cell.y),
    };
  });
}

const mod = (value: number, m: number): number => ((value % m) + m) % m;

/**
 * Searches for a tiling of the torus Z^2 / L, where L has basis (a, 0), (b, c) in Hermite
 * normal form. Any such tiling repeats to a periodic tiling of the plane.
 */
export function tileTorus(
  polyomino: Polyomino,
  a: number,
  b: number,
  c: number,
  stepBudget: number,
): SearchResult<PeriodicTiling> {
  const area = a * c;
  if (area % polyomino.size !== 0) return { kind: "impossible" };
  const index = (x: number, y: number): number => {
    const q = Math.floor(y / c);
    return (y - q * c) * a + mod(x - q * b, a);
  };
  const shapes = shapesOf(polyomino);
  const grid = new Uint8Array(area);
  const placements: PeriodicTiling["placements"] = [];
  const cells = new Int32Array(polyomino.size);
  let steps = 0;

  const search = (from: number): boolean | "budget" => {
    let target = from;
    while (target < area && grid[target]) target++;
    if (target === area) return true;
    if (++steps > stepBudget) return "budget";
    const tx = target % a;
    const ty = (target - tx) / a;
    for (const shape of shapes) {
      for (let anchor = 0; anchor < shape.xs.length; anchor++) {
        const left = tx - (shape.xs[anchor] as number);
        const top = ty - (shape.ys[anchor] as number);
        let ok = true;
        for (let i = 0; i < shape.xs.length && ok; i++) {
          const cell = index(
            left + (shape.xs[i] as number),
            top + (shape.ys[i] as number),
          );
          // Cells before the target are all covered; a copy may not hit them or itself.
          if (grid[cell]) ok = false;
          for (let j = 0; j < i && ok; j++) if (cells[j] === cell) ok = false;
          cells[i] = cell;
        }
        if (!ok) continue;
        for (let i = 0; i < shape.xs.length; i++) grid[cells[i] as number] = 1;
        const covered = Int32Array.from(cells);
        placements.push({ o: shape.o, x: left, y: top });
        const result = search(target + 1);
        if (result !== false) return result;
        placements.pop();
        for (const cell of covered) grid[cell] = 0;
      }
    }
    return false;
  };

  const result = search(0);
  if (result === "budget") return { kind: "budget" };
  return result
    ? { kind: "found", value: { a, b, c, placements: [...placements] } }
    : { kind: "impossible" };
}

/**
 * Looks for a periodic tiling with at most maxCopies copies per period, over every lattice of
 * the right area. Returns the first one found, "budget" if some search was cut short and none
 * was found, or undefined if none exists with that many copies per period.
 */
export function periodicTiling(
  polyomino: Polyomino,
  maxCopies: number,
  stepBudget: number,
): PeriodicTiling | "budget" | undefined {
  let budgetHit = false;
  for (let copies = 1; copies <= maxCopies; copies++) {
    const area = copies * polyomino.size;
    for (let a = 1; a <= area; a++) {
      if (area % a !== 0) continue;
      const c = area / a;
      for (let b = 0; b < a; b++) {
        const result = tileTorus(polyomino, a, b, c, stepBudget);
        if (result.kind === "found") return result.value;
        if (result.kind === "budget") budgetHit = true;
      }
    }
  }
  return budgetHit ? "budget" : undefined;
}

/**
 * Can every cell of a side x side square be covered by non-overlapping copies, which may stick
 * out of the square on every side? "impossible" proves the piece does not tile the plane.
 */
export function coverSquare(
  polyomino: Polyomino,
  side: number,
  stepBudget: number,
): SearchResult<true> {
  const shapes = shapesOf(polyomino);
  const margin = Math.max(polyomino.width, polyomino.height);
  const span = side + 2 * margin;
  const grid = new Uint8Array(span * span);
  let steps = 0;

  const search = (from: number): boolean | "budget" => {
    let target = from;
    const regionArea = side * side;
    while (
      target < regionArea &&
      grid[
        (margin + Math.floor(target / side)) * span + margin + (target % side)
      ]
    )
      target++;
    if (target === regionArea) return true;
    if (++steps > stepBudget) return "budget";
    const tx = margin + (target % side);
    const ty = margin + Math.floor(target / side);
    for (const shape of shapes) {
      for (let anchor = 0; anchor < shape.xs.length; anchor++) {
        const left = tx - (shape.xs[anchor] as number);
        const top = ty - (shape.ys[anchor] as number);
        let ok = true;
        for (let i = 0; i < shape.xs.length && ok; i++)
          if (
            grid[
              (top + (shape.ys[i] as number)) * span +
                left +
                (shape.xs[i] as number)
            ]
          )
            ok = false;
        if (!ok) continue;
        for (let i = 0; i < shape.xs.length; i++)
          grid[
            (top + (shape.ys[i] as number)) * span +
              left +
              (shape.xs[i] as number)
          ] = 1;
        const result = search(target + 1);
        if (result !== false) return result;
        for (let i = 0; i < shape.xs.length; i++)
          grid[
            (top + (shape.ys[i] as number)) * span +
              left +
              (shape.xs[i] as number)
          ] = 0;
      }
    }
    return false;
  };

  const result = search(0);
  if (result === "budget") return { kind: "budget" };
  return result ? { kind: "found", value: true } : { kind: "impossible" };
}

export type PlaneVerdict =
  | { readonly kind: "tiles"; readonly tiling: PeriodicTiling }
  | { readonly kind: "no"; readonly side: number }
  | { readonly kind: "undecided" };

export function planeVerdict(
  polyomino: Polyomino,
  maxCopies: number,
  sides: readonly number[],
  stepBudget: number,
): PlaneVerdict {
  const periodic = periodicTiling(polyomino, maxCopies, stepBudget);
  if (typeof periodic === "object") return { kind: "tiles", tiling: periodic };
  for (const side of sides) {
    const cover = coverSquare(polyomino, side, stepBudget);
    if (cover.kind === "impossible") return { kind: "no", side };
  }
  return { kind: "undecided" };
}
