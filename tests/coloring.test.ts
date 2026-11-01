import { describe, expect, it } from "vitest";
import { minimumColoring } from "../src/core/coloring";

function graph(
  vertexCount: number,
  edges: readonly [number, number][],
): number[][] {
  const adjacency = Array.from({ length: vertexCount }, () => [] as number[]);
  for (const [a, b] of edges) {
    adjacency[a]?.push(b);
    adjacency[b]?.push(a);
  }
  return adjacency;
}

function cycle(length: number, offset = 0): [number, number][] {
  return Array.from(
    { length },
    (_, i) => [offset + i, offset + ((i + 1) % length)] as [number, number],
  );
}

function expectProper(adjacency: number[][], colors: Int32Array): void {
  adjacency.forEach((neighbors, vertex) => {
    for (const neighbor of neighbors)
      expect(colors[vertex]).not.toBe(colors[neighbor]);
  });
}

describe("minimumColoring", () => {
  it.each([
    ["no edges", graph(3, []), 1],
    ["even cycle", graph(6, cycle(6)), 2],
    ["odd cycle", graph(5, cycle(5)), 3],
    [
      "K4",
      graph(4, [
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 3],
        [2, 3],
      ]),
      4,
    ],
    [
      "odd wheel",
      graph(6, [...cycle(5), [5, 0], [5, 1], [5, 2], [5, 3], [5, 4]]),
      4,
    ],
    [
      "even wheel",
      graph(7, [...cycle(6), [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5]]),
      3,
    ],
  ])("colors a %s optimally", (_, adjacency, expected) => {
    const coloring = minimumColoring(adjacency);
    expect(coloring.colorCount).toBe(expected);
    expect(coloring.exact).toBe(true);
    expectProper(adjacency, coloring.colors);
  });

  it("reports an inexact result when the budget runs out", () => {
    const adjacency = graph(5, cycle(5));
    const coloring = minimumColoring(adjacency, 0);
    expect(coloring.exact).toBe(false);
    expectProper(adjacency, coloring.colors);
  });
});
