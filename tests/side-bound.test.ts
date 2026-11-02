import { beforeAll, describe, expect, it } from "vitest";

/** Native searches spawn processes; give them room when the machine is busy. */
const NATIVE_TIMEOUT_MS = 60_000;
import { Polyomino } from "../src/core/polyomino";
import {
  ensureNativeTiler,
  parseNativeOutput,
} from "../tools/lib/native-tiler";
import { ruleOutSide } from "../tools/lib/side-bound";

const BUDGET = 100_000_000;

beforeAll(() => {
  ensureNativeTiler();
}, 120_000);

describe("ruleOutSide", () => {
  it(
    "rules out every side of a piece that tiles no rectangle",
    async () => {
      // The X pentomino tiles no rectangle and no half-strip.
      const x = Polyomino.fromId("40e040");
      for (const side of [1, 3, 5, 6])
        expect(await ruleOutSide(x, side, BUDGET)).toMatchObject({
          kind: "ruled-out",
        });
    },
    NATIVE_TIMEOUT_MS,
  );

  it(
    "finds a rectangle when one exists",
    async () => {
      const verdict = await ruleOutSide(Polyomino.fromId("c080"), 2, BUDGET);
      expect(verdict.kind).toBe("found");
    },
    NATIVE_TIMEOUT_MS,
  );

  it(
    "stays undecided when the strip goes on to the far wall",
    async () => {
      // L-tromino strips of height 4 never die out: 4 x 6 tiles, so the probe reaches the wall.
      const verdict = await ruleOutSide(Polyomino.fromId("c080"), 4, BUDGET);
      expect(verdict.kind).not.toBe("ruled-out");
    },
    NATIVE_TIMEOUT_MS,
  );
});

describe("parseNativeOutput wall fields", () => {
  it("keeps wall rejects and the farthest column of an exhausted run", () => {
    expect(
      parseNativeOutput(
        '{"result":"exhausted","nodes":5,"wallRejects":0,"farthestColumn":7}',
        [0],
        9,
        3,
      ),
    ).toEqual({
      kind: "exhausted",
      nodes: 5,
      wallRejects: 0,
      farthestColumn: 7,
    });
  });
});
