import { appendFileSync, createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { CLASSIFICATION_DIR } from "../../src/core/classification";
import { PROJECT_ROOT } from "./store";

export function recordPath(
  size: number,
  directory = join(PROJECT_ROOT, "output", CLASSIFICATION_DIR),
): string {
  return join(directory, `${size}.txt`);
}

/**
 * Adds pieces shown to tile no rectangle to an existing record, under one new reason. The file
 * is read line by line (records reach hundreds of megabytes) to find the next reason index and
 * to refuse pieces already listed.
 */
export async function appendToRecord(
  path: string,
  reason: string,
  ids: readonly string[],
): Promise<void> {
  if (!existsSync(path))
    throw new Error(`${path} is missing: classify that size first`);
  if (reason.includes("\n")) throw new Error(`reason spans lines: ${reason}`);
  const wanted = new Set(ids);
  if (wanted.size !== ids.length) throw new Error("duplicate IDs to append");
  let reasons = 0;
  const lines = createInterface({ input: createReadStream(path) });
  for await (const line of lines) {
    if (line.startsWith("reason ")) {
      reasons++;
      continue;
    }
    const id = line.slice(0, line.indexOf(" "));
    if (wanted.has(id)) throw new Error(`${id} is already in ${path}`);
  }
  appendFileSync(
    path,
    [
      `reason ${reasons} ${reason}`,
      ...ids.map((id) => `${id} ${reasons}`),
      "",
    ].join("\n"),
  );
}
