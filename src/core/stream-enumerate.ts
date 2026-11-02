import { ORIENTATION_COUNT } from "./polyomino";

/** One free polyomino as the streaming enumeration reports it. */
export interface StreamedPolyomino {
  /** Canonical ID, identical to Polyomino.id. */
  readonly id: string;
  readonly hasHole: boolean;
  readonly isRectangle: boolean;
}

const BITS_PER_BYTE = 8;
const WIDE_ID_PREFIX = "x";
const WIDE_ROW_SEPARATOR = ".";

/**
 * Streams every free polyomino with `size` cells exactly once, in a fixed order, using memory
 * proportional to the size only. Redelmeier's method visits each fixed polyomino once; a fixed
 * shape is reported only when it is the canonical orientation of its free class, the one whose
 * encoding is the ID (fewest rows, then the largest hex encoding, as in Polyomino.id).
 */
export function* streamFreePolyominoes(
  size: number,
): Generator<StreamedPolyomino> {
  if (!Number.isInteger(size) || size < 1)
    throw new Error(`size must be a positive integer, got ${size}`);
  const canonical = new CanonicalChecker(size);
  // Cells live at x in [-(size - 1), size - 1], y in [0, size - 1]; a margin column on each side
  // and a margin row below keep neighbor indices in range.
  const gridWidth = 2 * size + 1;
  const offset = size;
  const reached = new Uint8Array(gridWidth * (size + 1));
  const cells = new Int32Array(size);
  const origin = offset;
  reached[origin] = 1;

  const allowed = (index: number): boolean => {
    const y = Math.floor(index / gridWidth);
    const x = (index % gridWidth) - offset;
    return y < size && (y > 0 || x >= 0) && Math.abs(x) < size;
  };

  // Explicit stack of frames: each frame holds its own untried list.
  const untriedStack: number[][] = [[origin]];
  const addedStack: number[][] = [[]];
  const depthStack: number[] = [0];
  while (untriedStack.length > 0) {
    const top = untriedStack.length - 1;
    const untried = untriedStack[top] as number[];
    const depth = depthStack[top] as number;
    if (untried.length === 0) {
      for (const cell of addedStack[top] as number[]) reached[cell] = 0;
      untriedStack.pop();
      addedStack.pop();
      depthStack.pop();
      continue;
    }
    const cell = untried.pop() as number;
    cells[depth] = cell;
    if (depth + 1 === size) {
      const found = canonical.check(cells, gridWidth, offset);
      if (found !== undefined) yield found;
      continue;
    }
    const added: number[] = [];
    for (const neighbor of [
      cell + 1,
      cell - 1,
      cell + gridWidth,
      cell - gridWidth,
    ]) {
      if (neighbor < 0 || reached[neighbor] || !allowed(neighbor)) continue;
      reached[neighbor] = 1;
      added.push(neighbor);
    }
    untriedStack.push([...untried, ...added]);
    addedStack.push(added);
    depthStack.push(depth + 1);
  }
}

/** Tests whether a fixed polyomino is its free class's canonical orientation, reusing buffers. */
class CanonicalChecker {
  private readonly xs: Int32Array;
  private readonly ys: Int32Array;
  private readonly bestRows: Int32Array;
  private readonly rows: Int32Array;

  constructor(private readonly size: number) {
    this.xs = new Int32Array(size);
    this.ys = new Int32Array(size);
    this.bestRows = new Int32Array(size);
    this.rows = new Int32Array(size);
  }

  check(
    cells: Int32Array,
    gridWidth: number,
    offset: number,
  ): StreamedPolyomino | undefined {
    const { size, xs, ys } = this;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = 0;
    for (let i = 0; i < size; i++) {
      const cell = cells[i] as number;
      const y = Math.floor(cell / gridWidth);
      const x = (cell % gridWidth) - offset;
      xs[i] = x;
      ys[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const width = maxX - minX + 1;
    const height = maxY + 1;
    // The canonical orientation has the fewest rows: height <= width.
    if (height > width) return undefined;
    for (let i = 0; i < size; i++) xs[i] = (xs[i] as number) - minX;
    this.encodeRows(0, width, height, this.bestRows);
    for (let k = 1; k < ORIENTATION_COUNT; k++) {
      // Orientations that swap the axes have `width` rows; they compete only when square.
      const swaps = k % 2 === 1;
      if (swaps && width !== height) continue;
      this.encodeRows(k, width, height, this.rows);
      if (compareRows(this.rows, this.bestRows, height) > 0) return undefined;
    }
    return {
      id: idFromRows(this.bestRows, width, height),
      hasHole: hasHole(this.bestRows, width, height),
      isRectangle: size === width * height,
    };
  }

  /** Row bitmasks (leftmost cell = highest bit) of orientation k, matching transformCell. */
  private encodeRows(
    orientation: number,
    width: number,
    height: number,
    out: Int32Array,
  ): void {
    const swaps = orientation % 2 === 1;
    const outWidth = swaps ? height : width;
    const outHeight = swaps ? width : height;
    out.fill(0, 0, outHeight);
    for (let i = 0; i < this.size; i++) {
      let x = this.xs[i] as number;
      let y = this.ys[i] as number;
      // Rotate clockwise (x, y) -> (-y, x), shifted back into the box each time.
      let boxWidth = width;
      let boxHeight = height;
      for (let turn = 0; turn < orientation % 4; turn++) {
        [x, y] = [boxHeight - 1 - y, x];
        [boxWidth, boxHeight] = [boxHeight, boxWidth];
      }
      if (orientation >= 4) x = boxWidth - 1 - x;
      out[y] = (out[y] as number) | (1 << (outWidth - 1 - x));
    }
  }
}

function compareRows(a: Int32Array, b: Int32Array, count: number): number {
  for (let i = 0; i < count; i++) {
    const difference = (a[i] as number) - (b[i] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

function idFromRows(rows: Int32Array, width: number, height: number): string {
  const bytesPerRow = Math.ceil(width / BITS_PER_BYTE);
  const shift = bytesPerRow * BITS_PER_BYTE - width;
  const hexRows: string[] = [];
  for (let y = 0; y < height; y++)
    hexRows.push(
      ((rows[y] as number) * 2 ** shift)
        .toString(16)
        .padStart(bytesPerRow * 2, "0"),
    );
  return bytesPerRow === 1
    ? hexRows.join("")
    : WIDE_ID_PREFIX + hexRows.join(WIDE_ROW_SEPARATOR);
}

/** True when an empty cell inside the bounding box cannot reach the outside by edge moves. */
function hasHole(rows: Int32Array, width: number, height: number): boolean {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const filled = (x: number, y: number): boolean =>
    x >= 1 &&
    y >= 1 &&
    x <= width &&
    y <= height &&
    (((rows[y - 1] as number) >> (width - x)) & 1) === 1;
  const visited = new Uint8Array(paddedWidth * paddedHeight);
  const stack = [0];
  visited[0] = 1;
  let reachedCount = 1;
  let filledCount = 0;
  for (let y = 0; y < height; y++)
    for (let bits = rows[y] as number; bits !== 0; bits &= bits - 1)
      filledCount++;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % paddedWidth;
    const y = (index - x) / paddedWidth;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= paddedWidth || ny >= paddedHeight) continue;
      const next = ny * paddedWidth + nx;
      if (visited[next] || filled(nx, ny)) continue;
      visited[next] = 1;
      reachedCount++;
      stack.push(next);
    }
  }
  return reachedCount + filledCount < paddedWidth * paddedHeight;
}
