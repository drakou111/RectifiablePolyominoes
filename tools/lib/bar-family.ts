import type { Placement } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";

/**
 * The bar family: a row of n cells on a row of n + 1 cells, with one more cell under the left
 * end. n = 1 is the T-tetromino, n = 9 is xff80.ffc0.8000.
 */
export function barPiece(n: number): Polyomino {
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`bar length must be a positive integer, got ${n}`);
  return Polyomino.fromRows(["#".repeat(n), "#".repeat(n + 1), "#"]);
}

export interface BarTiling {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement[];
}

/**
 * For n = 1 (mod 4): a 2(n+1) x (n+3) rectangle from n + 3 copies. One flat copy lies along the
 * top left and one along the bottom right; between them upright copies stand side by side in
 * pairs whose tails interlock, (n+1)/2 hanging from the top copy and (n-1)/2 resting on the
 * bottom one, plus one upright at x = n. Orientation indices refer to the canonical ID, which
 * for this family is the drawing in barPiece.
 */
export function barTiling(n: number): BarTiling {
  if (n % 4 !== 1)
    throw new Error(`the construction needs n = 1 (mod 4), got ${n}`);
  if (barPiece(n).encode() !== barPiece(n).id)
    throw new Error(`bar piece ${n} is not drawn in its canonical orientation`);
  const placements: Placement[] = [{ o: 0, x: 0, y: 0 }];
  for (let x = 0; x <= n - 1; x += 2)
    placements.push({ o: (x / 2) % 2 === 0 ? 3 : 5, x, y: 2 });
  placements.push({ o: 1, x: n, y: 0 });
  placements.push({ o: 2, x: n + 1, y: n });
  for (let x = n + 2; x <= 2 * n - 1; x += 2)
    placements.push({ o: ((x - n - 2) / 2) % 2 === 0 ? 7 : 1, x, y: 0 });
  return { width: 2 * (n + 1), height: n + 3, placements };
}

export const BAR_FAMILY_NOTE =
  "One of the bar pieces: a row of n cells on a row of n + 1, with one cell under the left end. Every n = 1 (mod 4) gives a 2(n+1) x (n+3) tiling with n + 3 copies (tools/bar-family.ts). Other lengths behave very differently: n = 3 needs 180 copies, n = 4 needs 138 and n = 8 needs 468, while n = 6 and 7 are open.";
