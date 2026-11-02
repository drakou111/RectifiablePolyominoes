import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseClassification } from "../src/core/classification";

const CLI_TIMEOUT_MS = 120_000;
const directory = mkdtempSync(join(tmpdir(), "classify-size-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function classify(...extra: string[]): {
  status: number | null;
  output: string;
} {
  const result = spawnSync(
    process.execPath,
    [
      join("node_modules", "tsx", "dist", "cli.mjs"),
      "tools/classify-size.ts",
      "--size",
      "7",
      "--chunk",
      "16",
      "--workers",
      "2",
      "--state-dir",
      join(directory, "state"),
      "--record-dir",
      join(directory, "record"),
      "--dry-run",
      ...extra,
    ],
    { encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("tools/classify-size.ts", () => {
  it(
    "classifies every heptomino and refuses to overwrite the record",
    () => {
      const first = classify();
      expect(first.status, first.output).toBe(0);
      // 108 heptominoes: 1 with a hole, 1 rectangle (1 x 7) and 106 others, of which 99 tile none.
      expect(first.output).toContain(
        "size 7: 108 pieces (1 with holes), 99 tile no rectangle",
      );
      const record = parseClassification(
        readFileSync(join(directory, "record", "7.txt"), "utf8"),
      );
      expect(record.size).toBe(7);
      expect(record.lines).toHaveLength(99);
      expect(new Set(record.lines.map((line) => line.id)).size).toBe(99);

      const again = classify();
      expect(again.status).not.toBe(0);
      expect(again.output).toMatch(/exists already/);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    "resumes from its checkpoint and rebuilds the same record",
    () => {
      const path = join(directory, "record", "7.txt");
      const before = readFileSync(path, "utf8");
      rmSync(path);
      const resumed = classify();
      expect(resumed.status, resumed.output).toBe(0);
      expect(resumed.output).toMatch(/resuming at piece 112 \(chunk 7\)/);
      expect(readFileSync(path, "utf8")).toBe(before);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    "refuses to resume with different settings",
    () => {
      const changed = classify("--max-copies", "4");
      expect(changed.status).not.toBe(0);
      expect(changed.output).toMatch(/different settings/);
    },
    CLI_TIMEOUT_MS,
  );
});
