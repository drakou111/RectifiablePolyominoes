import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_TIMEOUT_MS = 180_000;

function sweep(...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      join("node_modules", "tsx", "dist", "cli.mjs"),
      "tools/exact-width-sweep.ts",
      ...args,
    ],
    { encoding: "utf8" },
  );
}

describe("tools/exact-width-sweep.ts", () => {
  it("rejects a piece whose rectifiability is settled", () => {
    const result = sweep("--only", "f040", "--dry-run");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/f040: needs an open rectifiable record/);
  });

  it(
    "decides widths again from --from in a dry run",
    () => {
      const result = sweep(
        "--only",
        "fcfe80",
        "--from",
        "58",
        "--max-side",
        "60",
        "--jobs",
        "2",
        "--threads",
        "1",
        "--dry-run",
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/fcfe80 width \d+: dead at row \d+/);
      expect(result.stdout).toMatch(/# done fcfe80: 60/);
    },
    CLI_TIMEOUT_MS,
  );
});
