import { describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import {
  decidePlaneSat,
  parsePlaneOutput,
  planeSchedule,
} from "../tools/lib/plane-sat";

const UV_TIMEOUT_MS = 120_000;
const DOMINO = [
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [0, 1],
  ],
] as const;

describe("planeSchedule", () => {
  it("interleaves torus steps with cover tests, small first", () => {
    expect(planeSchedule(6, [8, 4])).toEqual([
      ["torus", 1],
      ["torus", 2],
      ["cover", 4],
      ["torus", 3],
      ["torus", 4],
      ["cover", 8],
      ["torus", 5],
      ["torus", 6],
    ]);
  });
});

describe("parsePlaneOutput", () => {
  it("accepts a torus tiling that covers each cell once", () => {
    expect(
      parsePlaneOutput(
        '{"result":"tiles","a":2,"b":1,"c":1,"placements":[[0,0,0]]}',
        DOMINO,
        2,
      ),
    ).toEqual({ kind: "tiles", a: 2, b: 1, c: 1, copies: 1 });
  });

  it("rejects a tiling that misses or doubles cells", () => {
    expect(() =>
      parsePlaneOutput(
        '{"result":"tiles","a":4,"b":0,"c":1,"placements":[[0,0,0]]}',
        DOMINO,
        2,
      ),
    ).toThrow(/exactly once/);
    expect(() =>
      parsePlaneOutput(
        '{"result":"tiles","a":2,"b":0,"c":1,"placements":[]}',
        DOMINO,
        2,
      ),
    ).toThrow(/exactly once/);
  });

  it("passes verdicts through and fails loudly on junk", () => {
    expect(parsePlaneOutput('{"result":"no","side":8}', DOMINO, 2)).toEqual({
      kind: "no",
      side: 8,
    });
    expect(parsePlaneOutput('{"result":"undecided"}', DOMINO, 2)).toEqual({
      kind: "undecided",
    });
    expect(() => parsePlaneOutput('{"result":"maybe"}', DOMINO, 2)).toThrow();
  });
});

describe("decidePlaneSat", () => {
  it(
    "matches known verdicts",
    async () => {
      const schedule = planeSchedule(8, [6, 8]);
      // Recorded by tools/plane.ts: 4 copies on lattice (12, 0), (3, 3); no 8 x 8 cover.
      expect(
        await decidePlaneSat(Polyomino.fromId("4040fc10"), schedule, 60),
      ).toMatchObject({ kind: "tiles", copies: 4 });
      expect(
        await decidePlaneSat(Polyomino.fromId("40c07c10"), schedule, 60),
      ).toEqual({ kind: "no", side: 8 });
    },
    UV_TIMEOUT_MS,
  );

  it(
    "reports undecided when no step settles it",
    async () => {
      expect(
        await decidePlaneSat(Polyomino.fromId("40c07c10"), [["cover", 4]], 60),
      ).toEqual({ kind: "undecided" });
    },
    UV_TIMEOUT_MS,
  );
});
