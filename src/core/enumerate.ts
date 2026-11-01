import { NEIGHBOR_STEPS, Polyomino, type Cell } from "./polyomino";

/**
 * All free polyominoes (rotations and reflections identified) with 1..maxSize cells,
 * grouped by size: result[n - 1] holds the n-ominoes, sorted by ID.
 */
export function enumerateFreePolyominoes(maxSize: number): Polyomino[][] {
  if (!Number.isInteger(maxSize) || maxSize < 1)
    throw new Error(`maxSize must be a positive integer, got ${maxSize}`);
  const bySize: Polyomino[][] = [[Polyomino.fromCells([{ x: 0, y: 0 }])]];
  for (let size = 2; size <= maxSize; size++) {
    const found = new Map<string, Polyomino>();
    for (const parent of bySize[size - 2] ?? []) {
      for (const cell of parent.cells) {
        for (const [dx, dy] of NEIGHBOR_STEPS) {
          const x = cell.x + dx;
          const y = cell.y + dy;
          if (parent.has(x, y)) continue;
          const child = Polyomino.fromCells([
            ...parent.cells,
            { x, y } satisfies Cell,
          ]);
          const id = child.id;
          if (!found.has(id)) found.set(id, child.canonical());
        }
      }
    }
    bySize.push([...found.values()].sort((a, b) => compareIds(a.id, b.id)));
  }
  return bySize;
}

/** Orders IDs so that shorter (flatter) shapes come first, then by hex value. */
export function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
