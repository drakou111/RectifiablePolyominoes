import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("tools/side-bounds.ts", () => {
  it("rejects a piece whose rectifiability is settled", () => {
    const result = spawnSync(
      process.execPath,
      [
        join("node_modules", "tsx", "dist", "cli.mjs"),
        "tools/side-bounds.ts",
        "--only",
        "f040",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/f040: needs an open rectifiable record/);
  });
});
