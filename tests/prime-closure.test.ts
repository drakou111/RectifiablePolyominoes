import { describe, expect, it } from "vitest";
import { allPrimesEven, PrimeClosure } from "../src/core/prime-closure";

describe("PrimeClosure", () => {
  // L tetromino: primes 2x4 and 3x8 (Reid).
  const lTetromino = new PrimeClosure(
    [
      [2, 4],
      [3, 8],
    ],
    60,
  );

  it("glues primes along full sides", () => {
    expect(lTetromino.isTileable(4, 4)).toBe(true); // 2x4 + 2x4
    expect(lTetromino.isTileable(5, 8)).toBe(true); // 2x8 + 3x8
    expect(lTetromino.isTileable(3, 4)).toBe(false);
    expect(lTetromino.isTileable(8, 2)).toBe(true);
  });

  it("finds the smallest square", () => {
    expect(lTetromino.smallestSquare()).toBe(4);
  });

  it("finds no odd count when every prime is even", () => {
    expect(
      allPrimesEven(
        [
          [2, 4],
          [3, 8],
        ],
        4,
      ),
    ).toBe(true);
    expect(lTetromino.oddOrder(4, 2)).toBeUndefined();
  });

  it("finds the odd order of the Y pentomino from its prime list", () => {
    // Reid's complete list for the Y pentomino; the smallest odd rectangle is 15 x 15 (45 copies).
    const yPrimes: [number, number][] = [
      [5, 10],
      [9, 20],
      [9, 30],
      [9, 45],
      [9, 55],
      [10, 14],
      [10, 16],
      [10, 23],
      [10, 27],
      [11, 20],
      [11, 30],
      [11, 35],
      [11, 45],
      [12, 50],
      [12, 55],
      [12, 60],
      [12, 65],
      [12, 70],
      [12, 75],
      [12, 80],
      [12, 85],
      [12, 90],
      [12, 95],
      [13, 20],
      [13, 30],
      [13, 35],
      [13, 45],
      [14, 15],
      [15, 15],
      [15, 16],
      [15, 17],
      [15, 19],
      [15, 21],
      [15, 22],
      [15, 23],
      [17, 20],
      [17, 25],
      [18, 25],
      [18, 35],
      [22, 25],
    ];
    const closure = new PrimeClosure(yPrimes, 120);
    expect(closure.oddOrder(5, 5)).toBe(45);
    expect(closure.smallestSquare()).toBe(10);
  });
});
