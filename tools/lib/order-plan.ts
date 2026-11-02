import type {
  Placement,
  PropertyRecord,
  RectangleSize,
} from "../../src/core/model";

/** The outcome of every rectangle holding one number of copies. */
export interface CopyStep {
  readonly copies: number;
  /** Rectangles tiled at this count, narrow side first, with their tilings. */
  readonly found: readonly (readonly [RectangleSize, Placement[]])[];
  /** True when every rectangle at this count was searched to the end or tiled. */
  readonly decided: boolean;
}

export interface OrderRecords {
  readonly rectifiable: PropertyRecord<boolean>;
  readonly order: PropertyRecord<number>;
  readonly smallestRectangles?: PropertyRecord<RectangleSize[]>;
}

const SEARCHED =
  "every rectangle holding fewer copies was ruled out by exhaustive search";

/**
 * Turns the steps of an order search (copy counts from `firstCopies` up, in order) into records.
 * The order is settled only when every smaller count was decided with no tiling; the smallest
 * rectangles only when the winning count was decided completely too.
 */
export function orderRecords(
  firstCopies: number,
  steps: readonly CopyStep[],
): OrderRecords {
  let lower = firstCopies;
  for (const step of steps) {
    if (step.copies !== lower) break;
    if (!step.decided || step.found.length > 0) break;
    lower++;
  }
  const firstFound = steps.find((step) => step.found.length > 0);
  if (firstFound === undefined)
    return {
      rectifiable: {
        status: "open",
        ref: "site-solver",
        note: `Not resolved by this site's searches: no rectangle holding fewer than ${lower} copies can be tiled.`,
      },
      order: {
        status: "open",
        lower,
        ref: "site-solver",
        note: `Every rectangle holding fewer than ${lower} copies was ruled out by exhaustive search; the piece may not tile any rectangle.`,
      },
    };
  const [[a, b]] = firstFound.found as [readonly [RectangleSize, Placement[]]];
  const rectifiable: PropertyRecord<boolean> = {
    status: "computed",
    value: true,
    ref: "site-solver",
    reason: `A stored tiling covers a ${a} x ${b} rectangle.`,
  };
  if (lower < firstFound.copies)
    return {
      rectifiable,
      order: {
        status: "open",
        lower,
        upper: firstFound.copies,
        ref: "site-solver",
        note: `A stored tiling uses ${firstFound.copies} copies; every rectangle holding fewer than ${lower} copies was ruled out by exhaustive search.`,
      },
    };
  return {
    rectifiable,
    order: {
      status: "computed",
      value: firstFound.copies,
      ref: "site-solver",
      reason: `A stored tiling uses ${firstFound.copies} copies, and ${SEARCHED}.`,
    },
    ...(firstFound.decided && {
      smallestRectangles: {
        status: "computed",
        value: firstFound.found.map(([size]) => [...size] as RectangleSize),
        ref: "site-solver",
        reason: `Every rectangle holding ${firstFound.copies} copies was searched to the end.`,
      },
    }),
  };
}
