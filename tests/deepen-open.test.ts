import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_TIMEOUT_MS = 120_000;

describe("tools/deepen-open.ts", () => {
  it(
    "reports on the open pieces of a size without writing in a dry run",
    () => {
      const result = spawnSync(
        process.execPath,
        [
          join("node_modules", "tsx", "dist", "cli.mjs"),
          "tools/deepen-open.ts",
          "--sizes",
          "11-11",
          "--depths",
          "6",
          "--band-height",
          "4",
          "--max-states",
          "1000",
          "--workers",
          "2",
          "--dry-run",
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/^2 open pieces/);
      expect(result.stdout).toMatch(/2 still open dry run, nothing written/);
    },
    CLI_TIMEOUT_MS,
  );

  it("rejects a malformed size range", () => {
    const result = spawnSync(
      process.execPath,
      [
        join("node_modules", "tsx", "dist", "cli.mjs"),
        "tools/deepen-open.ts",
        "--sizes",
        "14",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--sizes must look like/);
  });
});
