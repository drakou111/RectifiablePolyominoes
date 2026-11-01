/** A unit square of the grid. x grows to the right, y grows downward. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

export const ORIENTATION_COUNT = 8;
const BITS_PER_BYTE = 8;
const WIDE_ID_PREFIX = "x";
const WIDE_ROW_SEPARATOR = ".";

/**
 * Orientation k: rotate clockwise by 90 * (k % 4) degrees, then mirror left-right if k >= 4.
 * Orientation 0 is the shape exactly as its ID draws it.
 */
export function transformCell(cell: Cell, orientation: number): Cell {
  let { x, y } = cell;
  for (let turn = 0; turn < orientation % 4; turn++) [x, y] = [-y, x];
  if (orientation >= 4) x = -x;
  return { x, y };
}

export type SymmetryGroup =
  "D4" | "C4" | "D2" | "D2 diagonal" | "C2" | "D1" | "D1 diagonal" | "C1";

export const SYMMETRY_DESCRIPTIONS: Record<SymmetryGroup, string> = {
  D4: "all 8 symmetries of the square",
  C4: "90-degree rotation only",
  D2: "two mirror axes parallel to the grid",
  "D2 diagonal": "two diagonal mirror axes",
  C2: "180-degree rotation only",
  D1: "one mirror axis parallel to the grid",
  "D1 diagonal": "one diagonal mirror axis",
  C1: "no symmetry",
};

/** An immutable polyomino, normalized so its bounding box starts at (0, 0). */
export class Polyomino {
  readonly cells: readonly Cell[];
  readonly width: number;
  readonly height: number;
  private readonly cellKeys: ReadonlySet<number>;
  private cachedId: string | undefined;

  private constructor(cells: readonly Cell[], width: number, height: number) {
    this.cells = cells;
    this.width = width;
    this.height = height;
    this.cellKeys = new Set(cells.map((cell) => cell.y * width + cell.x));
  }

  /** Builds a polyomino from any set of cells. Throws on duplicates or disconnected input. */
  static fromCells(cells: readonly Cell[]): Polyomino {
    if (cells.length === 0)
      throw new Error("A polyomino needs at least one cell");
    const polyomino = Polyomino.normalized(cells);
    if (
      new Set(polyomino.cells.map((c) => `${c.x},${c.y}`)).size !== cells.length
    )
      throw new Error("Duplicate cells in polyomino");
    if (!polyomino.isConnected())
      throw new Error("Polyomino cells are not edge-connected");
    return polyomino;
  }

  /** Parses rows such as ["#######", ".###..."] where '#' is a cell. */
  static fromRows(rows: readonly string[]): Polyomino {
    const cells: Cell[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++)
        if (row[x] === "#") cells.push({ x, y });
    });
    return Polyomino.fromCells(cells);
  }

  /**
   * Decodes an ID in Dahlke's hex notation: each row is a byte, most significant bit = leftmost
   * cell. Shapes wider than 8 cells use "x" followed by "."-separated multi-byte rows.
   */
  static fromId(id: string): Polyomino {
    const rows = id.startsWith(WIDE_ID_PREFIX)
      ? id.slice(WIDE_ID_PREFIX.length).split(WIDE_ROW_SEPARATOR)
      : (id.match(/.{1,2}/g) ?? []);
    if (
      rows.length === 0 ||
      rows.some((row) => !/^[0-9a-f]+$/.test(row) || row.length % 2 !== 0)
    )
      throw new Error(`Malformed polyomino ID "${id}"`);
    const cells: Cell[] = [];
    rows.forEach((row, y) => {
      const bits = BigInt(`0x${row}`);
      const rowBits = row.length * 4;
      for (let x = 0; x < rowBits; x++)
        if ((bits >> BigInt(rowBits - 1 - x)) & 1n) cells.push({ x, y });
    });
    return Polyomino.fromCells(cells);
  }

  private static normalized(cells: readonly Cell[]): Polyomino {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { x, y } of cells) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const shifted = cells
      .map(({ x, y }) => ({ x: x - minX, y: y - minY }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    return new Polyomino(shifted, maxX - minX + 1, maxY - minY + 1);
  }

  get size(): number {
    return this.cells.length;
  }

  has(x: number, y: number): boolean {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height &&
      this.cellKeys.has(y * this.width + x)
    );
  }

  /** The shape in orientation k (see transformCell), normalized. */
  oriented(orientation: number): Polyomino {
    if (
      !Number.isInteger(orientation) ||
      orientation < 0 ||
      orientation >= ORIENTATION_COUNT
    )
      throw new Error(
        `Orientation must be an integer in 0..7, got ${orientation}`,
      );
    return Polyomino.normalized(
      this.cells.map((cell) => transformCell(cell, orientation)),
    );
  }

  /** Hex encoding of this exact orientation (not necessarily canonical). */
  encode(): string {
    const bytesPerRow = Math.ceil(this.width / BITS_PER_BYTE);
    const rowBits = bytesPerRow * BITS_PER_BYTE;
    const rows: bigint[] = new Array<bigint>(this.height).fill(0n);
    for (const { x, y } of this.cells)
      rows[y] = (rows[y] ?? 0n) | (1n << BigInt(rowBits - 1 - x));
    const hexRows = rows.map((row) =>
      row.toString(16).padStart(bytesPerRow * 2, "0"),
    );
    return bytesPerRow === 1
      ? hexRows.join("")
      : WIDE_ID_PREFIX + hexRows.join(WIDE_ROW_SEPARATOR);
  }

  /**
   * Canonical ID: among orientations with the fewest rows, the largest hex encoding.
   * This reproduces Dahlke's names (fe70, f840, f860, e070, e0b0, f08080).
   */
  get id(): string {
    if (this.cachedId !== undefined) return this.cachedId;
    const rowCount = Math.min(this.width, this.height);
    let best = "";
    for (let k = 0; k < ORIENTATION_COUNT; k++) {
      const shape = this.oriented(k);
      if (shape.height !== rowCount) continue;
      const code = shape.encode();
      if (code > best) best = code;
    }
    this.cachedId = best;
    return best;
  }

  /** The orientation in which this polyomino draws exactly as its ID. */
  canonical(): Polyomino {
    return Polyomino.fromId(this.id);
  }

  equals(other: Polyomino): boolean {
    return (
      this.width === other.width &&
      this.height === other.height &&
      this.cells.every((cell) => other.has(cell.x, cell.y))
    );
  }

  /** Orientation indices that map the shape onto itself. Always contains 0. */
  stabilizer(): number[] {
    const result: number[] = [];
    for (let k = 0; k < ORIENTATION_COUNT; k++)
      if (this.oriented(k).equals(this)) result.push(k);
    return result;
  }

  /** Indices of the distinct orientations (one representative each). */
  distinctOrientations(): number[] {
    const seen: Polyomino[] = [];
    const result: number[] = [];
    for (let k = 0; k < ORIENTATION_COUNT; k++) {
      const shape = this.oriented(k);
      if (seen.some((other) => other.equals(shape))) continue;
      seen.push(shape);
      result.push(k);
    }
    return result;
  }

  symmetryGroup(): SymmetryGroup {
    const fixed = new Set(this.stabilizer());
    switch (fixed.size) {
      case 8:
        return "D4";
      case 4:
        if (fixed.has(1)) return "C4";
        return fixed.has(4) ? "D2" : "D2 diagonal";
      case 2:
        if (fixed.has(2)) return "C2";
        return fixed.has(4) || fixed.has(6) ? "D1" : "D1 diagonal";
      default:
        return "C1";
    }
  }

  isRectangle(): boolean {
    return this.size === this.width * this.height;
  }

  /** True when some empty cell is enclosed (unreachable from outside by edge moves). */
  hasHole(): boolean {
    const paddedWidth = this.width + 2;
    const paddedHeight = this.height + 2;
    const visited = new Uint8Array(paddedWidth * paddedHeight);
    const stack = [0];
    visited[0] = 1;
    let reachedEmpty = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % paddedWidth;
      const y = (index - x) / paddedWidth;
      for (const [dx, dy] of NEIGHBOR_STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= paddedWidth || ny >= paddedHeight)
          continue;
        const next = ny * paddedWidth + nx;
        if (visited[next] || this.has(nx - 1, ny - 1)) continue;
        visited[next] = 1;
        reachedEmpty++;
        stack.push(next);
      }
    }
    return reachedEmpty + this.size < paddedWidth * paddedHeight;
  }

  private isConnected(): boolean {
    const first = this.cells[0];
    if (first === undefined) return false;
    const seen = new Set<number>([first.y * this.width + first.x]);
    const stack: Cell[] = [first];
    while (stack.length > 0) {
      const { x, y } = stack.pop() as Cell;
      for (const [dx, dy] of NEIGHBOR_STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        const key = ny * this.width + nx;
        if (!this.has(nx, ny) || seen.has(key)) continue;
        seen.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
    return seen.size === this.size;
  }
}

export const NEIGHBOR_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
