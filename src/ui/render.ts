import { minimumColoring, type Coloring } from "../core/coloring";
import type { Placement } from "../core/model";
import type { Polyomino } from "../core/polyomino";
import { pieceAdjacency, type ExpandedTiling } from "../core/tiling";
import { svg } from "./dom";

export type ColorMode =
  "fewest" | "orientation" | "position" | "order" | "outline";

export const COLOR_MODES: readonly {
  readonly mode: ColorMode;
  readonly label: string;
}[] = [
  { mode: "fewest", label: "Fewest colors (copies sharing an edge differ)" },
  { mode: "orientation", label: "By orientation (8 colors)" },
  { mode: "position", label: "Gradient by position" },
  { mode: "order", label: "Gradient by placement order" },
  { mode: "outline", label: "Outlines only" },
];

const FEWEST_PALETTE = [
  "#e3a33b",
  "#4f8fd6",
  "#62b562",
  "#d9574f",
  "#9b6fd1",
  "#8c8c8c",
];
const ORIENTATION_PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
];
const GRADIENT_HUE_SPAN = 270;
const OUTLINE_FILL = "var(--surface)";
/** Above this many cells, interior cell lines are left out to keep the SVG light. */
const MAX_CELLS_WITH_GRID = 4000;

const gradient = (t: number): string =>
  `hsl(${Math.round(GRADIENT_HUE_SPAN * t)} 65% 62%)`;

function cellSquare(x: number, y: number): string {
  return `M${x} ${y}h1v1h-1z`;
}

function baseSvg(
  width: number,
  height: number,
  className: string,
): SVGSVGElement {
  const margin = 0.1;
  return svg("svg", {
    class: className,
    viewBox: `${-margin} ${-margin} ${width + 2 * margin} ${height + 2 * margin}`,
    "data-cols": width,
    "data-rows": height,
  });
}

/** Draws a single polyomino. */
export function renderPolyomino(
  polyomino: Polyomino,
  className = "shape",
): SVGSVGElement {
  const root = baseSvg(polyomino.width, polyomino.height, className);
  let fill = "";
  let grid = "";
  let border = "";
  for (const { x, y } of polyomino.cells) {
    fill += cellSquare(x, y);
    if (polyomino.has(x + 1, y)) grid += `M${x + 1} ${y}v1`;
    if (polyomino.has(x, y + 1)) grid += `M${x} ${y + 1}h1`;
    if (!polyomino.has(x - 1, y)) border += `M${x} ${y}v1`;
    if (!polyomino.has(x + 1, y)) border += `M${x + 1} ${y}v1`;
    if (!polyomino.has(x, y - 1)) border += `M${x} ${y}h1`;
    if (!polyomino.has(x, y + 1)) border += `M${x} ${y + 1}h1`;
  }
  root.append(
    svg("path", { d: fill, class: "shape-fill" }),
    svg("path", { d: grid, class: "cell-line" }),
    svg("path", { d: border, class: "piece-border" }),
  );
  return root;
}

export interface TilingPicture {
  readonly element: SVGSVGElement;
  /** Set for the "fewest" mode. */
  readonly coloring?: Coloring;
}

/** Draws a tiling. `coloring` can be passed in to avoid recomputing it when switching modes. */
export function renderTiling(
  expanded: ExpandedTiling,
  placements: readonly Placement[],
  mode: ColorMode,
  cachedColoring?: Coloring,
): TilingPicture {
  const { width, height, grid } = expanded;
  const pieceCount = placements.length;
  let coloring: Coloring | undefined;
  const pieceColors: string[] = new Array<string>(pieceCount);

  if (mode === "fewest") {
    coloring =
      cachedColoring ?? minimumColoring(pieceAdjacency(expanded, pieceCount));
    for (let piece = 0; piece < pieceCount; piece++)
      pieceColors[piece] = FEWEST_PALETTE[
        (coloring.colors[piece] as number) % FEWEST_PALETTE.length
      ] as string;
  } else if (mode === "orientation") {
    placements.forEach(
      (placement, piece) =>
        (pieceColors[piece] = ORIENTATION_PALETTE[placement.o] as string),
    );
  } else if (mode === "order") {
    for (let piece = 0; piece < pieceCount; piece++)
      pieceColors[piece] = gradient(piece / Math.max(1, pieceCount - 1));
  } else if (mode === "position") {
    const sumX = new Float64Array(pieceCount);
    const sumY = new Float64Array(pieceCount);
    const counts = new Float64Array(pieceCount);
    grid.forEach((piece, index) => {
      sumX[piece] = (sumX[piece] as number) + (index % width);
      sumY[piece] = (sumY[piece] as number) + Math.floor(index / width);
      counts[piece] = (counts[piece] as number) + 1;
    });
    for (let piece = 0; piece < pieceCount; piece++) {
      const cx = (sumX[piece] as number) / (counts[piece] as number);
      const cy = (sumY[piece] as number) / (counts[piece] as number);
      pieceColors[piece] = gradient(
        (cx + cy) / Math.max(1, width + height - 2),
      );
    }
  } else {
    pieceColors.fill(OUTLINE_FILL);
  }

  const fills = new Map<string, string>();
  let cellLines = "";
  let borders = `M0 0H${width}V${height}H0Z`;
  const drawGrid = width * height <= MAX_CELLS_WITH_GRID;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const piece = grid[y * width + x] as number;
      const color = pieceColors[piece] ?? OUTLINE_FILL;
      fills.set(color, (fills.get(color) ?? "") + cellSquare(x, y));
      if (x + 1 < width) {
        const right = grid[y * width + x + 1];
        if (right !== piece) borders += `M${x + 1} ${y}v1`;
        else if (drawGrid) cellLines += `M${x + 1} ${y}v1`;
      }
      if (y + 1 < height) {
        const below = grid[(y + 1) * width + x];
        if (below !== piece) borders += `M${x} ${y + 1}h1`;
        else if (drawGrid) cellLines += `M${x} ${y + 1}h1`;
      }
    }
  }

  const root = baseSvg(
    width,
    height,
    mode === "outline" ? "tiling outline" : "tiling",
  );
  for (const [color, d] of fills)
    root.append(svg("path", { d, fill: color, class: "tiling-fill" }));
  if (cellLines !== "")
    root.append(svg("path", { d: cellLines, class: "cell-line" }));
  root.append(svg("path", { d: borders, class: "piece-border" }));
  return { element: root, coloring };
}
