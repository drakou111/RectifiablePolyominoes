import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enumerateFreePolyominoes } from "../src/core/enumerate";
import { parseLetterGrid } from "../src/core/letter-grid";
import { Polyomino } from "../src/core/polyomino";
import {
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";

const USAGE = `Imports Karl Dahlke's trec data into data/.

Usage: npx tsx tools/import-dahlke.ts [--hexlist <file>] [--solutions <file>]

  --hexlist    theorems/hexlist-2d from github.com/eklhad/trec (default scratch/dahlke/hexlist-2d)
  --solutions  solution-2d from the same repository (default scratch/dahlke/solution-2d)

Orders become "proven" with ref dahlke-trec, flagged untraced. Existing values are never
overwritten; disagreements are printed as conflicts.`;

const SOURCE_REF = "dahlke-trec";
const HEXLIST_MAX_SIZE = 6;
// "c8" cannot be a tromino (its cells are disconnected); it sits where the L tromino belongs.
const HEXLIST_TYPOS: Record<string, string> = { c8: "c080" };

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function importHexlist(store: DataStore, path: string): void {
  const covered = new Set<string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([0-9a-f]+):(\d+)\s*$/.exec(line.trim());
    if (match === null) {
      if (line.trim() !== "" && !line.startsWith("#"))
        throw new Error(`Unparsed hexlist line "${line}"`);
      continue;
    }
    const [, rawName, orderText] = match as unknown as [string, string, string];
    const name = HEXLIST_TYPOS[rawName] ?? rawName;
    const polyomino = Polyomino.fromId(name).canonical();
    if (covered.has(polyomino.id))
      throw new Error(`hexlist lists ${polyomino.id} twice`);
    covered.add(polyomino.id);

    const order = Number(orderText);
    const common = {
      ref: SOURCE_REF,
      refDetail: "theorems/hexlist-2d",
      untraced: true,
    } as const;
    if (order === 0) {
      store.setProperty(
        polyomino,
        "rectifiable",
        { status: "proven", value: false, ...common },
        "hexlist",
      );
      continue;
    }
    if (polyomino.isRectangle()) continue;
    store.setProperty(
      polyomino,
      "rectifiable",
      { status: "proven", value: true, ...common },
      "hexlist",
    );
    store.setProperty(
      polyomino,
      "order",
      { status: "proven", value: order, ...common },
      "hexlist",
    );
  }

  const missing = enumerateFreePolyominoes(HEXLIST_MAX_SIZE)
    .flat()
    .filter((shape) => !covered.has(shape.id))
    .map((shape) => shape.id);
  console.log(
    `hexlist: ${covered.size} polyominoes; not listed: ${missing.join(", ") || "none"}`,
  );
}

interface SolutionBlock {
  readonly header: string;
  readonly rows: string[];
}

function readSolutionBlocks(path: string): SolutionBlock[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const blocks: SolutionBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]?.trim() ?? "";
    if (!/order/.test(header) || !/^-+$/.test(lines[i + 1]?.trim() ?? ""))
      continue;
    const rows: string[] = [];
    let j = i + 2;
    while (j < lines.length && !/^-+$/.test(lines[j]?.trim() ?? ""))
      rows.push(lines[j++]?.trimEnd() ?? "");
    blocks.push({ header, rows });
    i = j;
  }
  return blocks;
}

function importSolutions(store: DataStore, path: string): void {
  let imported = 0;
  for (const { header, rows } of readSolutionBlocks(path)) {
    const name = header.split(/[: ]/)[0] ?? "";
    if (name.includes("_")) continue; // sets of several polyominoes are out of scope
    let tiling;
    try {
      tiling = parseLetterGrid(rows);
    } catch (error) {
      console.log(`skipped "${header}": ${(error as Error).message}`);
      continue;
    }
    const { polyomino, width, height, placements } = tiling;
    const exactOrder = /order (\d+)\[/.exec(header);
    const detail = `solution-2d, "${header}"`;
    if (
      exactOrder !== null &&
      Number(exactOrder[1]) === placements.length &&
      placements.length > 1
    ) {
      const common = {
        ref: SOURCE_REF,
        refDetail: "solution-2d",
        untraced: true,
      } as const;
      store.setProperty(
        polyomino,
        "rectifiable",
        { status: "proven", value: true, ...common },
        "solution-2d",
      );
      store.setProperty(
        polyomino,
        "order",
        { status: "proven", value: placements.length, ...common },
        "solution-2d",
      );
    }
    if (!/^[0-9a-f+]+$/.test(name)) store.addName(polyomino, name);
    const label = placements.length % 2 === 1 ? "odd" : undefined;
    store.writeTiling(
      polyomino,
      { width, height, placements, ref: SOURCE_REF, note: `Dahlke, ${detail}` },
      label,
    );
    imported++;
  }
  console.log(`solution-2d: ${imported} single-polyomino tilings`);
}

printHelpIfAsked(USAGE);
const store = new DataStore();
importHexlist(
  store,
  argument("--hexlist", join(PROJECT_ROOT, "scratch", "dahlke", "hexlist-2d")),
);
importSolutions(
  store,
  argument(
    "--solutions",
    join(PROJECT_ROOT, "scratch", "dahlke", "solution-2d"),
  ),
);
console.log(store.save());
reportConflicts(store.conflicts);
