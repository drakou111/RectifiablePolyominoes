import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Polyomino } from "../../src/core/polyomino";
import { parseNativeOutput, type NativeResult } from "./native-tiler";
import { PROJECT_ROOT } from "./store";

const SCRIPT_PATH = join(PROJECT_ROOT, "tools", "sat", "sat_tiler.py");

export interface SatSettings {
  /** Solver time limit; building the formula comes on top. */
  readonly seconds: number;
}

/**
 * Searches a rectangle with the SAT tiler (tools/sat/sat_tiler.py, run through uv). Results use
 * the native tiler's format, long side first; "exhausted" means the solver proved no tiling.
 */
export function tileRectangleSat(
  polyomino: Polyomino,
  a: number,
  b: number,
  settings: SatSettings,
): Promise<NativeResult> {
  const width = Math.max(a, b);
  const height = Math.min(a, b);
  const orientations = polyomino.distinctOrientations();
  const job = {
    width,
    height,
    seconds: settings.seconds,
    orientations: orientations.map((o) =>
      polyomino.oriented(o).cells.map((cell) => [cell.x, cell.y]),
    ),
  };
  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", "--quiet", SCRIPT_PATH], {
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      if (code !== 0) {
        reject(
          new Error(
            `sat_tiler failed on ${polyomino.id} ${width}x${height} (exit ${code}): ${Buffer.concat(stderr).toString("utf8").slice(-500)}`,
          ),
        );
        return;
      }
      try {
        resolve(parseNativeOutput(output, orientations, width, height));
      } catch (error) {
        reject(error as Error);
      }
    });
    child.stdin.end(JSON.stringify(job));
  });
}
