import { beforeAll, describe, expect, it } from "vitest";

/** Native searches spawn processes; give them room when the machine is busy. */
const NATIVE_TIMEOUT_MS = 60_000;
import { Polyomino } from "../src/core/polyomino";
import { expandTiling } from "../src/core/tiling";
import { ensureNativeTiler } from "../tools/lib/native-tiler";
import { searchOrder } from "../tools/lib/order-search";

beforeAll(() => {
  ensureNativeTiler();
}, 120_000);

describe("searchOrder", () => {
  it(
    "finds the order and every smallest rectangle",
    async () => {
      const l = await searchOrder(Polyomino.fromId("e080"), 10, 1_000_000);
      expect(l).toMatchObject({ kind: "settled", copies: 2 });
      const y = Polyomino.fromId("f040");
      const result = await searchOrder(y, 12, 100_000_000);
      if (result.kind !== "settled") throw new Error(result.kind);
      expect(result.copies).toBe(10);
      expect(result.found.map(([size]) => size)).toEqual([[5, 10]]);
      const first = result.found[0];
      if (first === undefined) throw new Error("no rectangle");
      const [[a, b], placements] = first;
      expect(expandTiling(y, b, a, placements).problems).toEqual([]);
    },
    NATIVE_TIMEOUT_MS,
  );

  it(
    "reports none below the cap and undecided on budget",
    async () => {
      const y = Polyomino.fromId("f040");
      expect(await searchOrder(y, 9, 100_000_000)).toEqual({ kind: "none" });
      expect(await searchOrder(y, 12, 1)).toEqual({ kind: "undecided" });
    },
    NATIVE_TIMEOUT_MS,
  );
});
