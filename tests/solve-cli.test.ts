import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_TIMEOUT_MS = 120_000;

function runSolve(...args: string[]) {
  return spawnSync(
    process.execPath,
    [join("node_modules", "tsx", "dist", "cli.mjs"), "tools/solve.ts", ...args],
    { encoding: "utf8" },
  );
}

describe("tools/solve.ts --only", () => {
  it(
    "solves a piece far above --max-size without enumerating its size",
    () => {
      const result = runSolve(
        "--only",
        "xffe0.8000.8000.8000.8000",
        "--depths",
        "10",
        "--workers",
        "1",
        "--dry-run",
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(
        /1 pieces in .*1 blocked by the corner test/,
      );
      expect(result.stdout).toMatch(/dry run, nothing written/);
    },
    CLI_TIMEOUT_MS,
  );

  it("rejects an ID that is not canonical", () => {
    const result = runSolve("--only", "x8000.8000.8000.8000.ffe0", "--dry-run");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/is not a canonical ID; use xffe0/);
  });
});
