import type { Placement } from "./model";
import {
  NEIGHBOR_STEPS,
  ORIENTATION_COUNT,
  Polyomino,
  type Cell,
} from "./polyomino";

export interface GridTiling {
  readonly polyomino: Polyomino;
  readonly width: number;
  readonly height: number;
  readonly placements: Placement[];
}

/**
 * Converts a tiling drawn as a character grid (each copy a connected region of one character,
 * neighbouring copies drawn with different characters) into canonical placements.
 * Throws if the regions are not all congruent copies of one polyomino.
 */
export function parseLetterGrid(rows: readonly string[]): GridTiling {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error("Empty grid");
  if (rows.some((row) => row.length !== width))
    throw new Error("Grid rows have different lengths");

  const charAt = (x: number, y: number): string => rows[y]?.[x] ?? "";
  const seen = new Uint8Array(width * height);
  const regions: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (seen[y * width + x]) continue;
      const symbol = charAt(x, y);
      const region: Cell[] = [];
      const stack: Cell[] = [{ x, y }];
      seen[y * width + x] = 1;
      while (stack.length > 0) {
        const cell = stack.pop() as Cell;
        region.push(cell);
        for (const [dx, dy] of NEIGHBOR_STEPS) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[ny * width + nx] || charAt(nx, ny) !== symbol) continue;
          seen[ny * width + nx] = 1;
          stack.push({ x: nx, y: ny });
        }
      }
      regions.push(region);
    }
  }

  const first = regions[0] as Cell[];
  const canonical = Polyomino.fromCells(first).canonical();
  const orientations = Array.from({ length: ORIENTATION_COUNT }, (_, k) =>
    canonical.oriented(k),
  );
  const placements = regions.map((region, index) => {
    if (region.length !== canonical.size)
      throw new Error(
        `Region ${index} at (${region[0]?.x}, ${region[0]?.y}) has ${region.length} cells, expected ${canonical.size}; two copies may share a character`,
      );
    const shape = Polyomino.fromCells(region);
    const o = orientations.findIndex((candidate) => candidate.equals(shape));
    if (o === -1)
      throw new Error(
        `Region ${index} at (${region[0]?.x}, ${region[0]?.y}) is not a copy of ${canonical.id}`,
      );
    const x = Math.min(...region.map((cell) => cell.x));
    const y = Math.min(...region.map((cell) => cell.y));
    return { o, x, y };
  });
  placements.sort((a, b) => a.y - b.y || a.x - b.x);
  return { polyomino: canonical, width, height, placements };
}
