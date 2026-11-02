import { describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import { expandTiling } from "../src/core/tiling";
import { tileRectangleSat } from "../tools/lib/sat-tiler";
import { runWitnessJobSat } from "../tools/lib/witness-job";

const SETTINGS = { seconds: 30 };
const UV_TIMEOUT_MS = 120_000;

describe("tileRectangleSat", () => {
  it(
    "finds valid tilings, long side first",
    async () => {
      for (const [id, a, b] of [
        ["e080", 2, 4],
        ["f040", 10, 5],
      ] as const) {
        const polyomino = Polyomino.fromId(id);
        const result = await tileRectangleSat(polyomino, a, b, SETTINGS);
        if (result.kind !== "found") throw new Error(`got ${result.kind}`);
        expect([result.width, result.height]).toEqual([
          Math.max(a, b),
          Math.min(a, b),
        ]);
        expect(
          expandTiling(
            polyomino,
            result.width,
            result.height,
            result.placements,
          ).problems,
        ).toEqual([]);
      }
    },
    UV_TIMEOUT_MS,
  );

  it(
    "proves rectangles untileable",
    async () => {
      const polyomino = Polyomino.fromId("e080");
      expect((await tileRectangleSat(polyomino, 3, 4, SETTINGS)).kind).toBe(
        "exhausted",
      );
      expect((await tileRectangleSat(polyomino, 3, 5, SETTINGS)).kind).toBe(
        "exhausted",
      );
    },
    UV_TIMEOUT_MS,
  );
});

describe("runWitnessJobSat", () => {
  it(
    "skips untileable candidates",
    async () => {
      const outcome = await runWitnessJobSat(
        {
          id: "e080",
          kind: "odd",
          rectangles: [
            [3, 4],
            [2, 4],
          ],
        },
        SETTINGS,
      );
      expect(outcome.kind).toBe("found");
    },
    UV_TIMEOUT_MS,
  );
});

describe("tileRectangleSat time limit", () => {
  it(
    "kills the solver and reports budget",
    async () => {
      // A wide prime rectangle of a 12-cell piece takes far longer than one second.
      const result = await tileRectangleSat(
        Polyomino.fromId("fcf030"),
        27,
        704,
        { seconds: 1 },
      );
      expect(result.kind).toBe("budget");
    },
    UV_TIMEOUT_MS,
  );
});
