export interface Coloring {
  /** Color index per vertex. */
  readonly colors: Int32Array;
  readonly colorCount: number;
  /** True when colorCount is proven minimal (the search finished within its step budget). */
  readonly exact: boolean;
}

export const DEFAULT_STEP_BUDGET = 2_000_000;

/**
 * Colors a graph with as few colors as it can: a DSATUR greedy coloring gives an upper bound,
 * then backtracking DSATUR tries each smaller count until the step budget runs out.
 */
export function minimumColoring(
  adjacency: readonly (readonly number[])[],
  stepBudget = DEFAULT_STEP_BUDGET,
): Coloring {
  const vertexCount = adjacency.length;
  if (vertexCount === 0)
    return { colors: new Int32Array(0), colorCount: 0, exact: true };

  let best = greedyDsatur(adjacency);
  const hasEdge = adjacency.some((list) => list.length > 0);
  const lowerBound = hasEdge ? 2 : 1;
  let exact = true;
  for (let target = best.colorCount - 1; target >= lowerBound; target--) {
    const attempt = backtrackColoring(adjacency, target, stepBudget);
    if (attempt === "budget") {
      exact = false;
      break;
    }
    if (attempt === "impossible") break;
    best = { colors: attempt, colorCount: target, exact: true };
  }
  return { ...best, exact };
}

function greedyDsatur(adjacency: readonly (readonly number[])[]): Coloring {
  const vertexCount = adjacency.length;
  const colors = new Int32Array(vertexCount).fill(-1);
  const saturation = Array.from(
    { length: vertexCount },
    () => new Set<number>(),
  );
  let colorCount = 0;
  for (let step = 0; step < vertexCount; step++) {
    const vertex = pickMostSaturated(adjacency, colors, saturation);
    let color = 0;
    while (saturation[vertex]?.has(color)) color++;
    colors[vertex] = color;
    colorCount = Math.max(colorCount, color + 1);
    for (const neighbor of adjacency[vertex] ?? [])
      saturation[neighbor]?.add(color);
  }
  return { colors, colorCount, exact: false };
}

function pickMostSaturated(
  adjacency: readonly (readonly number[])[],
  colors: Int32Array,
  saturation: readonly Set<number>[],
): number {
  let best = -1;
  let bestSaturation = -1;
  let bestDegree = -1;
  for (let vertex = 0; vertex < adjacency.length; vertex++) {
    if (colors[vertex] !== -1) continue;
    const vertexSaturation = saturation[vertex]?.size ?? 0;
    const degree = adjacency[vertex]?.length ?? 0;
    if (
      vertexSaturation > bestSaturation ||
      (vertexSaturation === bestSaturation && degree > bestDegree)
    ) {
      best = vertex;
      bestSaturation = vertexSaturation;
      bestDegree = degree;
    }
  }
  return best;
}

/** Exact k-coloring by backtracking DSATUR. */
function backtrackColoring(
  adjacency: readonly (readonly number[])[],
  colorLimit: number,
  stepBudget: number,
): Int32Array | "impossible" | "budget" {
  const vertexCount = adjacency.length;
  const colors = new Int32Array(vertexCount).fill(-1);
  // forbidden[v * colorLimit + c] counts colored neighbors of v that use color c.
  const forbidden = new Int32Array(vertexCount * colorLimit);
  let steps = 0;

  const saturationOf = (vertex: number): number => {
    let count = 0;
    for (let c = 0; c < colorLimit; c++)
      if ((forbidden[vertex * colorLimit + c] as number) > 0) count++;
    return count;
  };

  const adjust = (vertex: number, color: number, delta: number): void => {
    for (const neighbor of adjacency[vertex] ?? []) {
      const index = neighbor * colorLimit + color;
      forbidden[index] = (forbidden[index] as number) + delta;
    }
  };

  const solve = (colored: number, usedColors: number): boolean | "budget" => {
    if (colored === vertexCount) return true;
    if (++steps > stepBudget) return "budget";
    let vertex = -1;
    let bestSaturation = -1;
    let bestDegree = -1;
    for (let v = 0; v < vertexCount; v++) {
      if (colors[v] !== -1) continue;
      const saturation = saturationOf(v);
      const degree = adjacency[v]?.length ?? 0;
      if (
        saturation > bestSaturation ||
        (saturation === bestSaturation && degree > bestDegree)
      ) {
        vertex = v;
        bestSaturation = saturation;
        bestDegree = degree;
      }
    }
    if (bestSaturation === colorLimit) return false;
    // Symmetry breaking: never open more than one new color at a time.
    const maxColor = Math.min(colorLimit - 1, usedColors);
    for (let color = 0; color <= maxColor; color++) {
      if ((forbidden[vertex * colorLimit + color] as number) > 0) continue;
      colors[vertex] = color;
      adjust(vertex, color, 1);
      const result = solve(colored + 1, Math.max(usedColors, color + 1));
      if (result !== false) return result;
      adjust(vertex, color, -1);
      colors[vertex] = -1;
    }
    return false;
  };

  const result = solve(0, 0);
  if (result === "budget") return "budget";
  return result ? colors : "impossible";
}
