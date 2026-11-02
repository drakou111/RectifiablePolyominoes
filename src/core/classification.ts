/**
 * Compact record of pieces that tile no rectangle, one file per size under
 * output/classification/<n>.txt (kept locally, not published). The catalogue does not list these
 * pieces; the files are the evidence behind each size's "tile no rectangle" count. Format:
 *
 *   size <n>
 *   reason <index> <text>        one per distinct reason
 *   <id> <reason index>          one per piece, sorted by ID
 */
export const CLASSIFICATION_DIR = "classification";

export interface ClassificationLine {
  readonly id: string;
  readonly reason: string;
}

export interface Classification {
  readonly size: number;
  readonly lines: readonly ClassificationLine[];
}

export function formatClassification(
  size: number,
  lines: readonly ClassificationLine[],
): string {
  const reasons = [...new Set(lines.map((line) => line.reason))].sort();
  const index = new Map(reasons.map((reason, i) => [reason, i]));
  const sorted = [...lines].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  for (const reason of reasons)
    if (reason.includes("\n")) throw new Error(`reason spans lines: ${reason}`);
  return [
    `size ${size}`,
    ...reasons.map((reason, i) => `reason ${i} ${reason}`),
    ...sorted.map((line) => `${line.id} ${index.get(line.reason)}`),
    "",
  ].join("\n");
}

export function parseClassification(text: string): Classification {
  const rows = text.split("\n").filter((row) => row.trim() !== "");
  const header = /^size (\d+)$/.exec(rows[0] ?? "");
  if (header === null)
    throw new Error("classification file must start with 'size <n>'");
  const reasons: string[] = [];
  const lines: ClassificationLine[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const reason = /^reason (\d+) (.+)$/.exec(row);
    if (reason !== null) {
      if (Number(reason[1]) !== reasons.length)
        throw new Error(`reason indices must count up from 0: ${row}`);
      reasons.push(reason[2] as string);
      continue;
    }
    const piece = /^(\S+) (\d+)$/.exec(row);
    if (piece === null) throw new Error(`bad classification line: ${row}`);
    const text = reasons[Number(piece[2])];
    if (text === undefined) throw new Error(`unknown reason index: ${row}`);
    const id = piece[1] as string;
    if (seen.has(id)) throw new Error(`duplicate piece ${id}`);
    seen.add(id);
    lines.push({ id, reason: text });
  }
  return { size: Number(header[1]), lines };
}
