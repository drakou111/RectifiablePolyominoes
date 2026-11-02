import type { PropertyRecord, RectangleSize } from "../../src/core/model";
import type { Polyomino } from "../../src/core/polyomino";

export type HuntKind = "odd" | "square";

/** One rung of a hunt: an odd copy count or a square side, with the rectangles it allows. */
export interface HuntStep {
  readonly step: number;
  readonly area: number;
  /** Narrow side first; empty when no rectangle of this step can hold a copy. */
  readonly rectangles: RectangleSize[];
}

const stepSize = (kind: HuntKind): number => (kind === "odd" ? 2 : 1);

/** The first step at or above `lower`: odd copy counts must be odd. */
const firstStep = (kind: HuntKind, lower: number): number =>
  kind === "odd" && lower % 2 === 0 ? lower + 1 : lower;

/**
 * Steps from the lower bound up to `cap`, stopping below a known upper bound. A rectangle is
 * listed only when a copy fits inside it.
 */
export function huntCandidates(
  polyomino: Polyomino,
  kind: HuntKind,
  lower: number,
  upper: number | undefined,
  cap: number,
): HuntStep[] {
  const long = Math.max(polyomino.width, polyomino.height);
  const short = Math.min(polyomino.width, polyomino.height);
  const fits = (a: number, b: number): boolean => a >= short && b >= long;
  const last = Math.min(cap, upper === undefined ? cap : upper - 1);
  const steps: HuntStep[] = [];
  for (
    let step = firstStep(kind, lower);
    step <= last;
    step += stepSize(kind)
  ) {
    if (kind === "square") {
      const area = step * step;
      steps.push({
        step,
        area,
        rectangles:
          area % polyomino.size === 0 && fits(step, step) ? [[step, step]] : [],
      });
      continue;
    }
    const area = step * polyomino.size;
    const rectangles: RectangleSize[] = [];
    for (let a = 1; a * a <= area; a++)
      if (area % a === 0 && fits(a, area / a)) rectangles.push([a, area / a]);
    steps.push({ step, area, rectangles });
  }
  return steps;
}

const RULED_OUT_NOTE: Record<HuntKind, string> = {
  odd: "Every rectangle holding fewer odd copies was ruled out by exhaustive search.",
  square: "Every smaller square was ruled out by exhaustive search.",
};

/**
 * The record after a hunt: `ruledOut` lists steps with no tiling (searched to the end, or with
 * no rectangle), `found` a step with a stored tiling. The lower bound climbs over contiguous
 * ruled-out steps; when it meets the upper bound the value is settled.
 */
export function nextRecord(
  kind: HuntKind,
  current: PropertyRecord<number | "none">,
  ruledOut: readonly number[],
  found: number | undefined,
): PropertyRecord<number | "none"> {
  if (current.status !== "open" || current.lower === undefined)
    throw new Error("nextRecord needs an open record with a lower bound");
  const excluded = new Set(ruledOut);
  let lower = firstStep(kind, current.lower);
  while (excluded.has(lower)) lower += stepSize(kind);
  const ours = found !== undefined && (current.upper ?? Infinity) > found;
  const upper = ours ? found : current.upper;
  if (lower === current.lower && !ours) return current;

  const searched =
    kind === "odd"
      ? "every rectangle holding fewer odd copies was ruled out by exhaustive search"
      : "every smaller square was ruled out by exhaustive search";
  if (upper !== undefined && lower >= upper) {
    if (ours)
      return {
        status: "computed",
        value: upper,
        ref: "site-solver",
        reason:
          kind === "odd"
            ? `A stored tiling has ${upper} copies, and ${searched}.`
            : `A stored ${upper}x${upper} tiling exists, and ${searched}.`,
      };
    return {
      status: "computed",
      value: upper,
      ...(current.ref === undefined ? {} : { ref: current.ref }),
      ...(current.refDetail === undefined
        ? {}
        : { refDetail: current.refDetail }),
      ...(current.untraced === undefined ? {} : { untraced: current.untraced }),
      reason: `The reference gives a tiling with ${upper}, and ${searched} (this site).`,
    };
  }
  if (upper === undefined)
    return {
      status: "open",
      lower,
      ...(current.ref === undefined ? {} : { ref: current.ref }),
      note: RULED_OUT_NOTE[kind],
    };
  if (ours)
    return {
      status: "open",
      lower,
      upper,
      ref: "site-solver",
      note: `${RULED_OUT_NOTE[kind]} A stored tiling gives the upper bound.`,
    };
  return {
    ...current,
    lower,
    note: `Lower bound from this site's exhaustive search; upper bound from the reference's smallest known example.`,
  };
}
