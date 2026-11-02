import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  formatClassification,
  parseClassification,
} from "../src/core/classification";
import { appendToRecord } from "../tools/lib/record";

const directory = mkdtempSync(join(tmpdir(), "record-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("appendToRecord", () => {
  const path = join(directory, "5.txt");
  writeFileSync(
    path,
    formatClassification(5, [
      { id: "f8", reason: "old" },
      { id: "e8", reason: "old" },
    ]),
  );

  it("adds pieces under a new reason that parses back", async () => {
    await appendToRecord(path, "new reason", ["e0c0", "f080"]);
    const parsed = parseClassification(readFileSync(path, "utf8"));
    expect(parsed.lines).toEqual([
      { id: "e8", reason: "old" },
      { id: "f8", reason: "old" },
      { id: "e0c0", reason: "new reason" },
      { id: "f080", reason: "new reason" },
    ]);
  });

  it("refuses pieces already listed, a missing record and duplicates", async () => {
    await expect(appendToRecord(path, "again", ["f8"])).rejects.toThrow(
      /already in/,
    );
    await expect(
      appendToRecord(join(directory, "6.txt"), "x", ["e0"]),
    ).rejects.toThrow(/missing/);
    await expect(appendToRecord(path, "x", ["e0", "e0"])).rejects.toThrow(
      /duplicate/,
    );
  });
});
