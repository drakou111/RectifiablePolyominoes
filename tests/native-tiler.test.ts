import { beforeAll, describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import { expandTiling } from "../src/core/tiling";
import {
  ensureNativeTiler,
  parseNativeOutput,
  tileRectangleNative,
  type NativeSettings,
} from "../tools/lib/native-tiler";
import { runWitnessJobNative } from "../tools/lib/witness-job";

const SETTINGS: NativeSettings = {
  budget: 5_000_000,
  cacheBits: 16,
  seed: 0,
  pocketLimit: 2,
};
const COMPILE_TIMEOUT_MS = 120_000;

beforeAll(() => {
  ensureNativeTiler();
}, COMPILE_TIMEOUT_MS);

async function expectValidTiling(
  id: string,
  a: number,
  b: number,
  settings: NativeSettings,
): Promise<void> {
  const polyomino = Polyomino.fromId(id);
  const result = await tileRectangleNative(polyomino, a, b, settings);
  if (result.kind !== "found") throw new Error(`got ${result.kind}`);
  expect([result.width, result.height]).toEqual([
    Math.max(a, b),
    Math.min(a, b),
  ]);
  expect(result.placements).toHaveLength((a * b) / polyomino.size);
  expect(
    expandTiling(polyomino, result.width, result.height, result.placements)
      .problems,
  ).toEqual([]);
}

describe("tileRectangleNative", () => {
  it("tiles the L-tetromino's 2 x 4 and 4 x 4", async () => {
    await expectValidTiling("e080", 2, 4, SETTINGS);
    await expectValidTiling("e080", 4, 4, SETTINGS);
  });

  it("tiles the Y-pentomino's 5 x 10 with and without shuffling and pocket checks", async () => {
    await expectValidTiling("f040", 5, 10, SETTINGS);
    await expectValidTiling("f040", 10, 5, { ...SETTINGS, seed: 7 });
    await expectValidTiling("f040", 5, 10, { ...SETTINGS, pocketLimit: 0 });
    await expectValidTiling("f040", 5, 10, { ...SETTINGS, pocketLimit: 64 });
  });

  it("tiles a rectangle that needs a wide frontier window", async () => {
    // Short side 44: the frontier spans 3 x 44 = 132 bits, past two 64-bit words.
    await expectValidTiling("e080", 44, 46, SETTINGS);
  });

  it("exhausts rectangles that cannot be tiled", async () => {
    const polyomino = Polyomino.fromId("e080");
    // Three copies: the L-tetromino only tiles rectangles with an even number of copies.
    expect((await tileRectangleNative(polyomino, 3, 4, SETTINGS)).kind).toBe(
      "exhausted",
    );
    // Area not a multiple of 4.
    expect((await tileRectangleNative(polyomino, 3, 5, SETTINGS)).kind).toBe(
      "exhausted",
    );
  });

  it("stops at the budget", async () => {
    const result = await tileRectangleNative(Polyomino.fromId("f040"), 5, 10, {
      ...SETTINGS,
      budget: 1,
    });
    expect(result.kind).toBe("budget");
  });
});

describe("parseNativeOutput", () => {
  it("maps orientation indices back to orientation numbers", () => {
    const result = parseNativeOutput(
      '{"result":"found","nodes":3,"placements":[[0,0,0],[1,2,0]]}',
      [2, 5],
      4,
      2,
    );
    expect(result).toEqual({
      kind: "found",
      nodes: 3,
      width: 4,
      height: 2,
      placements: [
        { o: 2, x: 0, y: 0 },
        { o: 5, x: 2, y: 0 },
      ],
    });
  });

  it("fails loudly on unknown output and bad indices", () => {
    expect(() => parseNativeOutput('{"result":"what"}', [0], 1, 1)).toThrow();
    expect(() =>
      parseNativeOutput(
        '{"result":"found","nodes":1,"placements":[[3,0,0]]}',
        [0],
        1,
        1,
      ),
    ).toThrow(/orientation index 3/);
  });
});

describe("runWitnessJobNative", () => {
  it("skips exhausted candidates and finds the next", async () => {
    const outcome = await runWitnessJobNative(
      {
        id: "e080",
        kind: "odd",
        rectangles: [
          [3, 4],
          [2, 4],
        ],
      },
      { budget: 1_000_000, cacheBits: 16, pocketLimit: 2, seeds: [1, 2] },
    );
    expect(outcome.kind).toBe("found");
  });

  it("reports exhausted when every candidate is exhausted", async () => {
    const outcome = await runWitnessJobNative(
      { id: "e080", kind: "odd", rectangles: [[3, 4]] },
      { budget: 1_000_000, cacheBits: 16, pocketLimit: 2, seeds: [1] },
    );
    expect(outcome.kind).toBe("exhausted");
  });
});
