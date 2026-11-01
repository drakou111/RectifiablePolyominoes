import type { RectangleSize } from "./model";

/**
 * Every tileable rectangle is a prime or splits by a straight cut into two smaller tileable
 * rectangles, so with a complete prime list the tileable rectangles are exactly the closure
 * of the primes under gluing along a full side. This computes that closure for sides <= limit.
 */
export class PrimeClosure {
  readonly limit: number;
  private readonly tileable: Uint8Array;

  constructor(primes: readonly RectangleSize[], limit: number) {
    this.limit = limit;
    const size = limit + 1;
    const table = new Uint8Array(size * size);
    for (const [a, b] of primes) {
      if (a <= limit && b <= limit) {
        table[a * size + b] = 1;
        table[b * size + a] = 1;
      }
    }
    // Increasing (w, h) order: both parts of a split are smaller, so already final.
    for (let w = 1; w <= limit; w++) {
      for (let h = 1; h <= limit; h++) {
        if (table[w * size + h]) continue;
        let found = false;
        for (let cut = 1; cut <= w - cut && !found; cut++)
          found =
            table[cut * size + h] === 1 && table[(w - cut) * size + h] === 1;
        for (let cut = 1; cut <= h - cut && !found; cut++)
          found =
            table[w * size + cut] === 1 && table[w * size + h - cut] === 1;
        if (found) table[w * size + h] = 1;
      }
    }
    this.tileable = table;
  }

  isTileable(width: number, height: number): boolean {
    if (width > this.limit || height > this.limit)
      throw new Error(
        `${width}x${height} exceeds the closure limit ${this.limit}`,
      );
    return this.tileable[width * (this.limit + 1) + height] === 1;
  }

  /** Side of the smallest tileable square, if one has side <= limit. Exact: sub-rectangles of a square fit the limit. */
  smallestSquare(): number | undefined {
    for (let side = 1; side <= this.limit; side++)
      if (this.isTileable(side, side)) return side;
    return undefined;
  }

  /**
   * Fewest copies (odd) among tileable rectangles, or undefined if none is found or the answer
   * cannot be certified within the limit (a smaller odd rectangle might have a longer side).
   */
  oddOrder(
    cellsPerCopy: number,
    shortestPossibleSide: number,
  ): number | undefined {
    let bestArea = Infinity;
    for (let w = 1; w <= this.limit; w++)
      for (let h = w; h <= this.limit; h++) {
        const area = w * h;
        if (area >= bestArea || !this.isTileable(w, h)) continue;
        if ((area / cellsPerCopy) % 2 === 1) bestArea = area;
      }
    if (bestArea === Infinity) return undefined;
    // Any rectangle with area < bestArea has its long side < bestArea / shortestPossibleSide.
    if (bestArea / shortestPossibleSide > this.limit) return undefined;
    return bestArea / cellsPerCopy;
  }
}

/** If every prime holds an even number of copies, so does every tileable rectangle. */
export function allPrimesEven(
  primes: readonly RectangleSize[],
  cellsPerCopy: number,
): boolean {
  return primes.every(([w, h]) => ((w * h) / cellsPerCopy) % 2 === 0);
}
