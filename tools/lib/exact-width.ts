import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Polyomino } from "../../src/core/polyomino";
import { PROJECT_ROOT } from "./store";

const SOURCE_PATH = join(PROJECT_ROOT, "tools", "cpp", "exact_width.cpp");
const BIN_DIR = join(PROJECT_ROOT, "tools", "cpp", "bin");
/**
 * The original's build (fe70's needs). Smaller pieces still use it, since a build serves every
 * piece within its limits.
 */
const MIN_LEFT_REACH = 3;
const MIN_RIGHT_REACH = 6;
const MIN_COLUMN_BITS = 7;
/** Limits checked by exact_width.cpp's static asserts. */
const MAX_LEFT_REACH = 7;
const MAX_COLUMN_BITS = 8;
const WINDOW_BITS = 128;
const PENDING_BITS = 64;

/** The compile-time limits of one exact_width build. */
export interface ExactWidthBuild {
  /** Columns left of its first cell (in row-major order) any orientation reaches. */
  readonly leftReach: number;
  /** Columns right of its first cell any orientation reaches. */
  readonly rightReach: number;
  /** Rows of a transducer column: the most rows any orientation spans. */
  readonly columnBits: number;
}

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
 * The build a piece needs. The program fills a row's first empty cell with some piece's first
 * cell, so the left reach is the delay it must handle, and the right reach and row count bound
 * what one placement covers. Throws when the piece is beyond every build.
 */
export function requiredBuild(polyomino: Polyomino): ExactWidthBuild {
  let left = 0;
  let right = 0;
  let rows = 0;
  for (const o of polyomino.distinctOrientations()) {
    const cells = [...polyomino.oriented(o).cells].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    );
    const first = cells[0];
    if (first === undefined) throw new Error(`${polyomino.id} has no cells`);
    for (const cell of cells) {
      left = Math.max(left, first.x - cell.x);
      right = Math.max(right, cell.x - first.x);
      rows = Math.max(rows, cell.y - first.y + 1);
    }
  }
  const build = {
    leftReach: Math.max(left, MIN_LEFT_REACH),
    rightReach: Math.max(right, MIN_RIGHT_REACH),
    columnBits: Math.max(rows, MIN_COLUMN_BITS),
  };
  const { leftReach, rightReach, columnBits } = build;
  if (
    leftReach > MAX_LEFT_REACH ||
    columnBits > MAX_COLUMN_BITS ||
    (leftReach + 1 + rightReach) * columnBits > WINDOW_BITS ||
    rightReach * columnBits > PENDING_BITS
  )
    throw new Error(
      `${polyomino.id} needs ${rows} rows and reaches ${left} left / ${right} right, beyond exact_width`,
    );
  return build;
}

/** Compiles this build when it is missing or older than the source. */
export function ensureExactWidth(build: ExactWidthBuild): string {
  const { leftReach, rightReach, columnBits } = build;
  const path = join(
    BIN_DIR,
    `exact_width_l${leftReach}_r${rightReach}_c${columnBits}${process.platform === "win32" ? ".exe" : ""}`,
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
      `-DEW_RIGHT_REACH=${rightReach}`,
      `-DEW_COL_BITS=${columnBits}`,
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
  const binary = ensureExactWidth(requiredBuild(polyomino));
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
