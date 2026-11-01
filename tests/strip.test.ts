import { describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import {
  halfStripProof,
  stripProof,
  stripStateKey,
  sweepStrip,
} from "../src/core/strip";
import { expandTiling } from "../src/core/tiling";

const MAX_STATES = 1_000_000;

describe("sweepStrip", () => {
  it("finds the 2 x 4 rectangle of the L tetromino", () => {
    const l = Polyomino.fromId("e080");
    const result = sweepStrip(l, 2, true, MAX_STATES);
    expect(result.kind).toBe("reachable");
    if (result.kind !== "reachable" || result.placements === undefined) return;
    expect(result.width).toBe(4);
    expect(expandTiling(l, 4, 2, result.placements).problems).toEqual([]);
  });

  it("finds a valid tiling of the Y pentomino strip of height 5", () => {
    const y = Polyomino.fromId("f040");
    const result = sweepStrip(y, 5, true, MAX_STATES);
    expect(result.kind).toBe("reachable");
    if (result.kind !== "reachable" || result.placements === undefined) return;
    expect(result.width).toBe(10);
    expect(expandTiling(y, 10, 5, result.placements).problems).toEqual([]);
  });

  it("knows the T tetromino has no rectangle of height 2 or 3", () => {
    const t = Polyomino.fromId("e040");
    expect(sweepStrip(t, 2, true, MAX_STATES).kind).toBe("unreachable");
    expect(sweepStrip(t, 3, true, MAX_STATES).kind).toBe("unreachable");
  });
});

describe("stripProof", () => {
  it.each(["c060", "40e040", "e0a0", "f090"])(
    "proves %s tiles no rectangle",
    (id) => {
      expect(stripProof(Polyomino.fromId(id), 8, MAX_STATES).kind).toBe(
        "no-rectangle",
      );
    },
  );

  it.each(["e080", "e040", "f040", "f0a0"])(
    "never rules out the rectifiable %s",
    (id) => {
      expect(stripProof(Polyomino.fromId(id), 8, MAX_STATES).kind).toBe(
        "rectangle",
      );
    },
  );
});

describe("stripStateKey", () => {
  it("keeps masks apart that differ only above 16 rows", () => {
    const low = Int32Array.from([1, 0]);
    const high = Int32Array.from([1 + (1 << 16), 0]);
    expect(stripStateKey(low, 0)).not.toBe(stripStateKey(high, 0));
    expect(stripStateKey(Int32Array.from([1 << 20]), 3)).not.toBe(
      stripStateKey(Int32Array.from([1 << 4]), 3),
    );
  });
});

describe("tall bands", { timeout: 60_000 }, () => {
  it("never rules out a rectifiable piece with a tall band", () => {
    const band = sweepStrip(Polyomino.fromId("f040"), 18, false, MAX_STATES);
    expect(band.kind).not.toBe("unreachable");
  });
});

describe("half-strips", () => {
  it.each(["e080", "e040", "f040"])(
    "finds a half-strip for the rectifiable %s",
    (id) => {
      expect(halfStripProof(Polyomino.fromId(id), 8, MAX_STATES).kind).toBe(
        "half-strip",
      );
    },
  );

  it.each(["40e040", "e0a0", "c060"])("rules out half-strips for %s", (id) => {
    expect(halfStripProof(Polyomino.fromId(id), 8, MAX_STATES).kind).toBe(
      "no-half-strip",
    );
  });
});
