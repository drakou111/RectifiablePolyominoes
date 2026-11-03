import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandTiling } from "../src/core/tiling";
import { barPiece, barTiling } from "../tools/lib/bar-family";

const CLI_TIMEOUT_MS = 120_000;

describe("barPiece", () => {
  it("draws the piece in its canonical orientation", () => {
    expect(barPiece(9).id).toBe("xff80.ffc0.8000");
    expect(barPiece(8).id).toBe("xff00.ff80.8000");
    expect(barPiece(5).id).toBe("f8fc80");
    expect(barPiece(9).size).toBe(20);
  });

  it("rejects a bad length", () => {
    expect(() => barPiece(0)).toThrow(/positive integer/);
    expect(() => barPiece(2.5)).toThrow(/positive integer/);
  });
});

describe("barTiling", () => {
  it("tiles a 2(n+1) x (n+3) rectangle with n + 3 copies for n = 1 (mod 4)", () => {
    for (let n = 5; n <= 81; n += 4) {
      const { width, height, placements } = barTiling(n);
      expect([width, height, placements.length]).toEqual([
        2 * (n + 1),
        n + 3,
        n + 3,
      ]);
      const tiling = expandTiling(barPiece(n), width, height, placements);
      expect(tiling.problems, `n=${n}`).toEqual([]);
    }
  });

  it("refuses other lengths, and n = 1 whose canonical ID is drawn differently", () => {
    expect(() => barTiling(8)).toThrow(/n = 1 \(mod 4\)/);
    expect(() => barTiling(1)).toThrow(/canonical orientation/);
  });
});

describe("tools/bar-family.ts", () => {
  it(
    "reports the construction without writing in a dry run",
    () => {
      const result = spawnSync(
        process.execPath,
        [
          join("node_modules", "tsx", "dist", "cli.mjs"),
          "tools/bar-family.ts",
          "--n",
          "9,8,10",
          "--dry-run",
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(
        /n=9 xff80.ffc0.8000 \(20 cells\): 20 x 12 with 12 copies, tiling already stored/,
      );
      expect(result.stdout).toMatch(/n=8 xff00.ff80.8000: family note set/);
      expect(result.stdout).toMatch(/n=10 .*no entry and no construction/);
      expect(result.stdout).toMatch(/dry run, nothing written/);
    },
    CLI_TIMEOUT_MS,
  );
});
