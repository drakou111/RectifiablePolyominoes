import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Polyomino } from "../../src/core/polyomino";
import { PROJECT_ROOT } from "./store";

const SOURCE_PATH = join(PROJECT_ROOT, "tools", "cpp", "exact_width.cpp");
const BIN_DIR = join(PROJECT_ROOT, "tools", "cpp", "bin");
/** Limits fixed in exact_width.cpp: rows a piece spans, and columns right of its first cell. */
const MAX_ROWS = 7;
const MAX_RIGHT_REACH = 6;
const MAX_LEFT_REACH = 7;
/** The original's default reach; narrower pieces still use it, since a build serves every reach up to its own. */
const MIN_LEFT_REACH = 3;

export interface ExactWidthSettings {
  readonly threads: number;
  /**
   * Rows built width-independently before the per-width rows. The program's default of 8 suits
   * fe70, but with a larger reach that phase explodes while the per-width rows stay small.
   */
  readonly startRow: number;
  /** Scratch file prefix for the row automata. */
  readonly scratch: string;
}

export type ExactWidthResult =
  | { readonly kind: "dead"; readonly row: number }
  | { readonly kind: "rectangle"; readonly height: number }
  | {
      readonly kind: "forever";
      readonly earlier: number;
      readonly row: number;
    };

/**
 * How far left of its first cell (in row-major order) any orientation reaches. The program fills
 * a row's first empty cell with some piece's first cell, so this is the delay it must handle.
 * Throws when the piece is outside the program's other limits.
 */
export function requiredLeftReach(polyomino: Polyomino): number {
  let reach = 0;
  for (const o of polyomino.distinctOrientations()) {
    const cells = [...polyomino.oriented(o).cells].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    );
    const first = cells[0];
    if (first === undefined) throw new Error(`${polyomino.id} has no cells`);
    for (const cell of cells) {
      if (cell.y - first.y >= MAX_ROWS || cell.x - first.x > MAX_RIGHT_REACH)
        throw new Error(
          `${polyomino.id} spans more than ${MAX_ROWS} rows or ${MAX_RIGHT_REACH} columns right of its first cell, beyond exact_width`,
        );
      reach = Math.max(reach, first.x - cell.x);
    }
  }
  if (reach > MAX_LEFT_REACH)
    throw new Error(
      `${polyomino.id} reaches ${reach} columns left, beyond exact_width's ${MAX_LEFT_REACH}`,
    );
  return Math.max(reach, MIN_LEFT_REACH);
}

/** Compiles the build for this reach when it is missing or older than the source. */
export function ensureExactWidth(leftReach: number): string {
  const path = join(
    BIN_DIR,
    `exact_width_l${leftReach}${process.platform === "win32" ? ".exe" : ""}`,
  );
  if (
    existsSync(path) &&
    statSync(path).mtimeMs >= statSync(SOURCE_PATH).mtimeMs
  )
    return path;
  mkdirSync(BIN_DIR, { recursive: true });
  execFileSync(
    "g++",
    [
      "-O2",
      "-std=c++20",
      ...(process.platform === "win32" ? ["-static"] : []),
      `-DEW_LEFT_REACH=${leftReach}`,
      "-o",
      path,
      SOURCE_PATH,
    ],
    { stdio: "inherit" },
  );
  return path;
}

/** Decides exactly whether the width-`width` half-strip dies, tiles a rectangle or fills forever. */
export function runExactWidth(
  polyomino: Polyomino,
  width: number,
  settings: ExactWidthSettings,
): Promise<ExactWidthResult> {
  const binary = ensureExactWidth(requiredLeftReach(polyomino));
  const cells = polyomino.cells.map((c) => `${c.x},${c.y}`).join(" ");
  const args = [
    "--width",
    String(width),
    "--cells",
    cells,
    "--scratch",
    settings.scratch,
    "--threads",
    String(settings.threads),
    "--start-row",
    String(settings.startRow),
  ];
  return new Promise((resolve, reject) => {
    execFile(binary, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(
          new Error(
            `exact_width failed on ${polyomino.id} width ${width}: ${error.message} ${stderr}`,
          ),
        );
        return;
      }
      try {
        resolve(parseExactWidthOutput(stdout));
      } catch (parseError) {
        reject(parseError as Error);
      }
    });
  });
}

/** Reads the verdict from the program's last output line. */
export function parseExactWidthOutput(stdout: string): ExactWidthResult {
  const last = stdout.trim().split(/\r?\n/).at(-1) ?? "";
  const words = last.split(" ");
  const numbers = words.slice(1).map(Number);
  if (numbers.every(Number.isInteger)) {
    if (words[0] === "dead" && numbers.length === 1)
      return { kind: "dead", row: numbers[0] as number };
    if (words[0] === "rectangle" && numbers.length === 1)
      return { kind: "rectangle", height: numbers[0] as number };
    if (words[0] === "forever" && numbers.length === 2)
      return {
        kind: "forever",
        earlier: numbers[0] as number,
        row: numbers[1] as number,
      };
  }
  throw new Error(`unexpected exact_width output: ${last.slice(0, 200)}`);
}
