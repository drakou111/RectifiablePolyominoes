import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Placement } from "../../src/core/model";
import type { Polyomino } from "../../src/core/polyomino";
import { PROJECT_ROOT } from "./store";

const SOURCE_PATH = join(PROJECT_ROOT, "tools", "cpp", "rect_tiler.cpp");
export const NATIVE_TILER_PATH = join(
  PROJECT_ROOT,
  "tools",
  "cpp",
  "bin",
  process.platform === "win32" ? "rect_tiler.exe" : "rect_tiler",
);
/** Generous: a run is bounded by its node budget, this only catches a hung process. */
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export interface NativeSettings {
  /** Search nodes before giving up. */
  readonly budget: number;
  /** Memory of the failed-state cache, per process. */
  readonly cacheMegabytes: number;
  /** 0 keeps the natural orientation order; any other value shuffles it. */
  readonly seed: number;
  /** Moves leaving an empty pocket smaller than this many cells are rejected (capped at the copy size). */
  readonly pocketLimit: number;
}

export type NativeResult = { readonly nodes: number } & (
  | {
      readonly kind: "found";
      readonly width: number;
      readonly height: number;
      readonly placements: Placement[];
    }
  /**
   * Searched to the end: no tiling exists. `wallRejects` counts moves refused only by the far
   * wall and `farthestColumn` is the last column any copy reached; with no wall rejects the
   * verdict holds for every longer rectangle too (see tools/cpp/rect_tiler.cpp).
   */
  | {
      readonly kind: "exhausted";
      readonly wallRejects?: number;
      readonly farthestColumn?: number;
    }
  | { readonly kind: "budget" }
);

/** Compiles the native tiler when its binary is missing or older than the source. Throws when the compiler fails. */
export function ensureNativeTiler(): string {
  if (
    existsSync(NATIVE_TILER_PATH) &&
    statSync(NATIVE_TILER_PATH).mtimeMs >= statSync(SOURCE_PATH).mtimeMs
  )
    return NATIVE_TILER_PATH;
  mkdirSync(dirname(NATIVE_TILER_PATH), { recursive: true });
  execFileSync(
    "g++",
    ["-O3", "-std=c++20", "-o", NATIVE_TILER_PATH, SOURCE_PATH],
    { stdio: "inherit" },
  );
  return NATIVE_TILER_PATH;
}

/**
 * Searches a width x height rectangle with the native frontier tiler. It sweeps along the
 * longer side, so the rectangle is passed long side first and the tiling comes back that way.
 */
export function tileRectangleNative(
  polyomino: Polyomino,
  a: number,
  b: number,
  settings: NativeSettings,
): Promise<NativeResult> {
  const width = Math.max(a, b);
  const height = Math.min(a, b);
  const orientations = polyomino.distinctOrientations();
  const cellLists = orientations
    .map((o) =>
      polyomino
        .oriented(o)
        .cells.map((cell) => `${cell.x},${cell.y}`)
        .join(" "),
    )
    .join("|");
  const args = [
    "--width",
    String(width),
    "--height",
    String(height),
    "--orientations",
    cellLists,
    "--budget",
    String(settings.budget),
    "--cache-mb",
    String(settings.cacheMegabytes),
    "--seed",
    String(settings.seed),
    "--pocket-limit",
    String(settings.pocketLimit),
  ];
  return new Promise((resolve, reject) => {
    execFile(
      NATIVE_TILER_PATH,
      args,
      { maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new Error(
              `rect_tiler failed on ${polyomino.id} ${width}x${height}: ${error.message} ${stderr}`,
            ),
          );
          return;
        }
        try {
          resolve(parseNativeOutput(stdout, orientations, width, height));
        } catch (parseError) {
          reject(parseError as Error);
        }
      },
    );
  });
}

/** Turns the tiler's JSON line into a result, mapping orientation indices back to `o` values. */
export function parseNativeOutput(
  stdout: string,
  orientations: readonly number[],
  width: number,
  height: number,
): NativeResult {
  const parsed = JSON.parse(stdout) as {
    result: string;
    nodes: number;
    wallRejects?: number;
    farthestColumn?: number;
    placements?: [number, number, number][];
  };
  if (parsed.result === "budget")
    return { kind: "budget", nodes: parsed.nodes };
  if (parsed.result === "exhausted")
    return {
      kind: "exhausted",
      nodes: parsed.nodes,
      ...(parsed.wallRejects === undefined
        ? {}
        : { wallRejects: parsed.wallRejects }),
      ...(parsed.farthestColumn === undefined
        ? {}
        : { farthestColumn: parsed.farthestColumn }),
    };
  if (parsed.result !== "found" || parsed.placements === undefined)
    throw new Error(`unexpected rect_tiler output: ${stdout.slice(0, 200)}`);
  return {
    kind: "found",
    nodes: parsed.nodes,
    width,
    height,
    placements: parsed.placements.map(([index, x, y]) => {
      const o = orientations[index];
      if (o === undefined)
        throw new Error(`rect_tiler returned orientation index ${index}`);
      return { o, x, y };
    }),
  };
}
