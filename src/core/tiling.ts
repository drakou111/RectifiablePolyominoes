import type { Placement } from "./model";
import { Polyomino } from "./polyomino";

export interface ExpandedTiling {
  readonly width: number;
  readonly height: number;
  /** Piece index covering each cell (row-major), or -1 if uncovered. */
  readonly grid: Int32Array;
  readonly problems: readonly string[];
}

const MAX_REPORTED_PROBLEMS = 10;

/** Places every copy on the grid and reports overlaps, overhangs and gaps. */
export function expandTiling(
  polyomino: Polyomino,
  width: number,
  height: number,
  placements: readonly Placement[],
): ExpandedTiling {
  const problems: string[] = [];
  const report = (message: string): void => {
    if (problems.length < MAX_REPORTED_PROBLEMS) problems.push(message);
  };
  const grid = new Int32Array(width * height).fill(-1);
  const orientations = Array.from({ length: 8 }, (_, k) =>
    polyomino.oriented(k),
  );

  placements.forEach((placement, piece) => {
    const shape = orientations[placement.o];
    if (
      shape === undefined ||
      !Number.isInteger(placement.x) ||
      !Number.isInteger(placement.y)
    ) {
      report(`piece ${piece}: invalid placement ${JSON.stringify(placement)}`);
      return;
    }
    for (const cell of shape.cells) {
      const x = placement.x + cell.x;
      const y = placement.y + cell.y;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        report(`piece ${piece}: cell (${x}, ${y}) is outside the rectangle`);
        continue;
      }
      const index = y * width + x;
      const previous = grid[index] as number;
      if (previous !== -1)
        report(`pieces ${previous} and ${piece} overlap at (${x}, ${y})`);
      grid[index] = piece;
    }
  });

  const uncovered = grid.reduce(
    (count, piece) => count + (piece === -1 ? 1 : 0),
    0,
  );
  if (uncovered > 0) report(`${uncovered} cells are not covered`);
  return { width, height, grid, problems };
}

/** Adjacency lists of pieces that share at least one edge. */
export function pieceAdjacency(
  tiling: ExpandedTiling,
  pieceCount: number,
): number[][] {
  const neighbors = Array.from({ length: pieceCount }, () => new Set<number>());
  const { width, height, grid } = tiling;
  const link = (a: number, b: number): void => {
    if (a === b || a < 0 || b < 0) return;
    neighbors[a]?.add(b);
    neighbors[b]?.add(a);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const piece = grid[y * width + x] as number;
      if (x + 1 < width) link(piece, grid[y * width + x + 1] as number);
      if (y + 1 < height) link(piece, grid[(y + 1) * width + x] as number);
    }
  }
  return neighbors.map((set) => [...set]);
}
