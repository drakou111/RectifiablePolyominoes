import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";
import { barPiece } from "../tools/lib/bar-family";
import {
  parseExactWidthOutput,
  requiredLeftReach,
  runExactWidth,
} from "../tools/lib/exact-width";

/** Covers compiling a build of the native program the first time. */
const NATIVE_TIMEOUT_MS = 180_000;
const FE70 = Polyomino.fromRows(["#######", ".###"]);
const L_TETROMINO = Polyomino.fromRows(["#", "#", "##"]);
const Y_PENTOMINO = Polyomino.fromRows(["####", ".#"]);

const scratchDir = mkdtempSync(join(tmpdir(), "exact-width-"));
afterAll(() => rmSync(scratchDir, { recursive: true, force: true }));
const settings = {
  threads: 1,
  startRow: 1,
  scratch: join(scratchDir, "rows"),
};

describe("requiredLeftReach", () => {
  it("finds how far left of its first cell a piece reaches", () => {
    expect(requiredLeftReach(FE70)).toBe(3);
    expect(requiredLeftReach(barPiece(5))).toBe(5);
    expect(requiredLeftReach(barPiece(6))).toBe(6);
  });

  it("never goes below the original build's reach", () => {
    expect(requiredLeftReach(L_TETROMINO)).toBe(3);
  });

  it("rejects a piece too tall for the program", () => {
    expect(() => requiredLeftReach(barPiece(7))).toThrow(/7 rows/);
  });
});

describe("parseExactWidthOutput", () => {
  it("reads each verdict from the last line", () => {
    expect(parseExactWidthOutput("start 1\ncounts 1\ndead 2\n")).toEqual({
      kind: "dead",
      row: 2,
    });
    expect(parseExactWidthOutput("rectangle 8")).toEqual({
      kind: "rectangle",
      height: 8,
    });
    expect(parseExactWidthOutput("forever 8 13\r\n")).toEqual({
      kind: "forever",
      earlier: 8,
      row: 13,
    });
  });

  it("rejects anything else", () => {
    expect(() => parseExactWidthOutput("row 3 states 5")).toThrow(
      /unexpected exact_width output/,
    );
    expect(() => parseExactWidthOutput("dead x")).toThrow(/unexpected/);
  });
});

describe("runExactWidth", () => {
  it(
    "gives the original program's verdicts with the default reach",
    async () => {
      expect(await runExactWidth(FE70, 17, settings)).toEqual({
        kind: "dead",
        row: 25,
      });
      expect(await runExactWidth(L_TETROMINO, 7, settings)).toEqual({
        kind: "rectangle",
        height: 8,
      });
      expect(await runExactWidth(Y_PENTOMINO, 6, settings)).toEqual({
        kind: "forever",
        earlier: 8,
        row: 13,
      });
    },
    NATIVE_TIMEOUT_MS,
  );

  it(
    "handles pieces that reach further left",
    async () => {
      // the bar construction's 12 x 8 tiling, found from either side
      expect(await runExactWidth(barPiece(5), 8, settings)).toEqual({
        kind: "rectangle",
        height: 12,
      });
      expect(await runExactWidth(barPiece(5), 12, settings)).toEqual({
        kind: "rectangle",
        height: 8,
      });
      expect(await runExactWidth(barPiece(6), 40, settings)).toEqual({
        kind: "dead",
        row: 8,
      });
    },
    NATIVE_TIMEOUT_MS,
  );
});
