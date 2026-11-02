import type { PropertyRecord } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";
import type { SolveOutcome, SolveParameters } from "./solve-job";
import type { DataStore } from "./store";

export const SOLVER_REF = "site-solver";

export interface SolveSummary {
  ordersFound: number;
  blocked: number;
  stripBlocked: number;
  stripRectangles: number;
  tilingsWritten: number;
  readonly undecided: string[];
  readonly disagreements: string[];
}

export function newSolveSummary(): SolveSummary {
  return {
    ordersFound: 0,
    blocked: 0,
    stripBlocked: 0,
    stripRectangles: 0,
    tilingsWritten: 0,
    undecided: [],
    disagreements: [],
  };
}

/** Where a solve outcome's findings go. */
export interface SolveSink {
  readonly store: DataStore;
  readonly parameters: SolveParameters;
  readonly summary: SolveSummary;
  /** Compute and count only. */
  readonly dryRun: boolean;
  /** Stores a "tiles no rectangle" result; the classifier keeps these out of data/. */
  readonly recordNonTiler: (shape: Polyomino, reason: string) => void;
  /** Tool name for tiling notes, e.g. "tools/solve.ts". */
  readonly toolName: string;
}

const computed = (record: object): PropertyRecord<unknown> =>
  ({
    status: "computed",
    ref: SOLVER_REF,
    ...record,
  }) as PropertyRecord<unknown>;

/** The reason a piece tiles no rectangle, if the outcome proves it. */
export function nonTilerReason(outcome: SolveOutcome): string | undefined {
  if (typeof outcome.order === "object") return undefined;
  if (outcome.corner.kind === "blocked")
    return `No arrangement of copies fills the ${outcome.corner.depth} x ${outcome.corner.depth} corner region of any rectangle (exhaustive search over all rectangle sizes).`;
  if (outcome.strip.kind === "no-rectangle")
    return `Column sweep along a wall: no rectangle of height below ${outcome.strip.bandHeight} exists (exact search), and with a band of height ${outcome.strip.bandHeight} the edge can never be completed flat again, whatever the width (${outcome.strip.states} states explored).`;
  return undefined;
}

/** Records what one solve outcome proves, checking it against the data first. */
export function applySolveOutcome(
  outcome: SolveOutcome,
  sink: SolveSink,
): void {
  const { store, parameters, summary, dryRun } = sink;
  const shape = Polyomino.fromId(outcome.id);
  const known = store.entry(shape).properties;

  if (typeof outcome.order === "object") {
    summary.ordersFound++;
    const { order, smallest } = outcome.order;
    if (known.rectifiable?.value === false)
      summary.disagreements.push(
        `${outcome.id}: data says no rectangle, search found ${smallest[0]?.width}x${smallest[0]?.height}`,
      );
    if (known.order?.value !== undefined && known.order.value !== order)
      summary.disagreements.push(
        `${outcome.id}: data order ${String(known.order.value)}, search ${order}`,
      );
    if (!dryRun) {
      store.setProperty(
        shape,
        "rectifiable",
        computed({ value: true, reason: "A tiling was found." }),
        "solver",
      );
      store.setProperty(
        shape,
        "order",
        computed({
          value: order,
          reason: `Every rectangle holding fewer than ${order} copies was searched exhaustively.`,
        }),
        "solver",
      );
      store.setProperty(
        shape,
        "smallestRectangles",
        computed({
          value: smallest.map((s) => [s.width, s.height]),
          reason: `Every rectangle holding ${order} copies was searched exhaustively.`,
        }),
        "solver",
      );
      for (const tiling of smallest)
        if (
          store.writeTiling(shape, {
            ...tiling,
            ref: SOLVER_REF,
            note: `Found by exhaustive search (${sink.toolName}).`,
          })
        )
          summary.tilingsWritten++;
    }
  } else if (nonTilerReason(outcome) !== undefined) {
    if (outcome.corner.kind === "blocked") summary.blocked++;
    else summary.stripBlocked++;
    if (known.rectifiable?.value === true)
      summary.disagreements.push(
        `${outcome.id}: data says rectifiable, but ${outcome.corner.kind === "blocked" ? "the corner test" : "the strip sweep"} says no rectangle`,
      );
    if (!dryRun) sink.recordNonTiler(shape, nonTilerReason(outcome) as string);
  } else if (outcome.strip.kind === "rectangle") {
    summary.stripRectangles++;
    const { width, height, placements } = outcome.strip;
    if (known.rectifiable?.value === false)
      summary.disagreements.push(
        `${outcome.id}: data says no rectangle, strip sweep found ${width}x${height}`,
      );
    if (!dryRun) {
      store.setProperty(
        shape,
        "rectifiable",
        computed({
          value: true,
          reason: `A ${width} x ${height} tiling was found.`,
        }),
        "solver",
      );
      store.setProperty(
        shape,
        "order",
        outcome.order === "none"
          ? {
              status: "open",
              upper: placements.length,
              lower: parameters.maxCopies + 1,
              note: `Upper bound from a ${width} x ${height} tiling; every rectangle with at most ${parameters.maxCopies} copies was ruled out by exhaustive search.`,
            }
          : {
              status: "open",
              upper: placements.length,
              note: `Upper bound from a ${width} x ${height} tiling.`,
            },
        "solver",
      );
      if (
        store.writeTiling(shape, {
          width,
          height,
          placements,
          ref: SOLVER_REF,
          note: `Found by the strip sweep (${sink.toolName}): the narrowest rectangle height that can be tiled is ${height}.`,
        })
      )
        summary.tilingsWritten++;
    }
  } else if (known.rectifiable === undefined) {
    summary.undecided.push(outcome.id);
  }

  if (!dryRun)
    for (const tiling of outcome.tilings)
      if (
        store.writeTiling(shape, {
          ...tiling,
          ref: SOLVER_REF,
          note: `Found by exhaustive search (${sink.toolName}) for a smallest rectangle recorded from the literature.`,
        })
      )
        summary.tilingsWritten++;
}
