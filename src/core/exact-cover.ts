import type { Placement } from "./model";
import type { Polyomino } from "./polyomino";
import type { SearchResult } from "./solver";

/**
 * Tiles a width x height rectangle with Knuth's Dancing Links. Each step covers the cell with the
 * fewest placements left, so dead ends anywhere in the rectangle show up at once. This finds big
 * tilings that a fill-in-reading-order search cannot, at more cost per step.
 */
export function tileRectangleExactCover(
  polyomino: Polyomino,
  width: number,
  height: number,
  stepBudget: number,
): SearchResult<Placement[]> {
  const area = width * height;
  if (area % polyomino.size !== 0) return { kind: "impossible" };

  // Candidate placements: every orientation at every offset that fits.
  const rowCells: number[][] = [];
  const rowPlacements: Placement[] = [];
  for (const o of polyomino.distinctOrientations()) {
    const shape = polyomino.oriented(o);
    for (let y = 0; y + shape.height <= height; y++)
      for (let x = 0; x + shape.width <= width; x++) {
        rowCells.push(
          shape.cells.map((cell) => (y + cell.y) * width + x + cell.x),
        );
        rowPlacements.push({ o, x, y });
      }
  }

  // Node 0 is the root; nodes 1..area are column headers (one per cell).
  const nodeCount = 1 + area + rowCells.length * polyomino.size;
  const left = new Int32Array(nodeCount);
  const right = new Int32Array(nodeCount);
  const up = new Int32Array(nodeCount);
  const down = new Int32Array(nodeCount);
  const column = new Int32Array(nodeCount);
  const rowOf = new Int32Array(nodeCount);
  const columnSize = new Int32Array(area + 1);
  for (let c = 0; c <= area; c++) {
    left[c] = c === 0 ? area : c - 1;
    right[c] = c === area ? 0 : c + 1;
    up[c] = c;
    down[c] = c;
    column[c] = c;
  }
  let next = area + 1;
  rowCells.forEach((cells, row) => {
    const first = next;
    for (const cell of cells) {
      const c = cell + 1;
      const node = next++;
      column[node] = c;
      rowOf[node] = row;
      up[node] = up[c] as number;
      down[node] = c;
      down[up[c] as number] = node;
      up[c] = node;
      columnSize[c] = (columnSize[c] as number) + 1;
      left[node] = node === first ? node : node - 1;
      right[node] = first;
      if (node !== first) right[node - 1] = node;
      left[first] = node;
    }
  });

  const cover = (c: number): void => {
    right[left[c] as number] = right[c] as number;
    left[right[c] as number] = left[c] as number;
    for (let i = down[c] as number; i !== c; i = down[i] as number)
      for (let j = right[i] as number; j !== i; j = right[j] as number) {
        down[up[j] as number] = down[j] as number;
        up[down[j] as number] = up[j] as number;
        const size = column[j] as number;
        columnSize[size] = (columnSize[size] as number) - 1;
      }
  };
  const uncover = (c: number): void => {
    for (let i = up[c] as number; i !== c; i = up[i] as number)
      for (let j = left[i] as number; j !== i; j = left[j] as number) {
        const size = column[j] as number;
        columnSize[size] = (columnSize[size] as number) + 1;
        down[up[j] as number] = j;
        up[down[j] as number] = j;
      }
    right[left[c] as number] = c;
    left[right[c] as number] = c;
  };

  const chosen: number[] = [];
  let steps = 0;
  const search = (): boolean | "budget" => {
    if (right[0] === 0) return true;
    if (++steps > stepBudget) return "budget";
    let best = right[0] as number;
    for (let c = right[best] as number; c !== 0; c = right[c] as number)
      if ((columnSize[c] as number) < (columnSize[best] as number)) best = c;
    if (columnSize[best] === 0) return false;
    cover(best);
    for (let r = down[best] as number; r !== best; r = down[r] as number) {
      chosen.push(rowOf[r] as number);
      for (let j = right[r] as number; j !== r; j = right[j] as number)
        cover(column[j] as number);
      const result = search();
      for (let j = left[r] as number; j !== r; j = left[j] as number)
        uncover(column[j] as number);
      if (result !== false) return result;
      chosen.pop();
    }
    uncover(best);
    return false;
  };

  const result = search();
  if (result === "budget") return { kind: "budget" };
  if (!result) return { kind: "impossible" };
  return {
    kind: "found",
    value: chosen.map((row) => rowPlacements[row] as Placement),
  };
}
