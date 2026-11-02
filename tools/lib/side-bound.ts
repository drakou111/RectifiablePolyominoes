import type { Polyomino } from "../../src/core/polyomino";
import { tileRectangleNative, type NativeResult } from "./native-tiler";

/** Width of the first, long run: far enough that a wall-free exhaustion covers most widths. */
const MIN_PROBE_WIDTH = 400;
const PROBE_WIDTH_PER_SIDE = 8;

export type SideVerdict =
  /**
   * No rectangle with this short side exists, and no half-strip of this width. Widths up to
   * `longestChecked` were searched one by one; longer ones share the probe's search tree.
   */
  | { readonly kind: "ruled-out"; readonly longestChecked: number }
  | {
      readonly kind: "found";
      readonly result: Extract<NativeResult, { kind: "found" }>;
    }
  /** A run ran out of budget or reached the far wall. */
  | { readonly kind: "undecided"; readonly why: string };

/**
 * Decides whether any rectangle with short side `side` can be tiled. One long run from the left
 * wall that is exhausted without touching the far wall rules out every width past the column it
 * reached (and the half-strip of that width); the narrower widths are then searched one by one.
 */
export async function ruleOutSide(
  polyomino: Polyomino,
  side: number,
  budget: number,
): Promise<SideVerdict> {
  const settings = { budget, cacheMegabytes: 512, pocketLimit: 2, seed: 0 };
  const reach = Math.max(
    ...polyomino.distinctOrientations().map((o) => polyomino.oriented(o).width),
  );
  let probeWidth = Math.max(MIN_PROBE_WIDTH, PROBE_WIDTH_PER_SIDE * side);
  // A probe whose area is not a multiple of the size would end before searching anything.
  while ((side * probeWidth) % polyomino.size !== 0) probeWidth++;
  const probe = await tileRectangleNative(
    polyomino,
    side,
    probeWidth,
    settings,
  );
  if (probe.kind === "found") return { kind: "found", result: probe };
  if (probe.kind === "budget")
    return { kind: "undecided", why: `budget at ${side}x${probeWidth}` };
  if (probe.wallRejects !== 0 || probe.farthestColumn === undefined)
    return {
      kind: "undecided",
      why: `reached the far wall at ${side}x${probeWidth}`,
    };
  // Widths above this see the same search tree as the probe (see tools/cpp/rect_tiler.cpp).
  const safe = probe.farthestColumn + reach + polyomino.size + 1;
  // The probe itself must lie past that bound, or its pocket checks may have seen the wall.
  if (safe >= probeWidth)
    return { kind: "undecided", why: `probe ${side}x${probeWidth} too short` };
  for (let width = side; width <= safe; width++) {
    if (width === probeWidth || (side * width) % polyomino.size !== 0) continue;
    const result = await tileRectangleNative(polyomino, side, width, settings);
    if (result.kind === "found") return { kind: "found", result };
    if (result.kind === "budget")
      return { kind: "undecided", why: `budget at ${side}x${width}` };
  }
  return { kind: "ruled-out", longestChecked: safe };
}
