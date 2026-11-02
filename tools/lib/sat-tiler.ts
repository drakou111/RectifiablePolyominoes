import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import type { Polyomino } from "../../src/core/polyomino";
import { parseNativeOutput, type NativeResult } from "./native-tiler";
import { PROJECT_ROOT } from "./store";

const SCRIPT_PATH = join(PROJECT_ROOT, "tools", "sat", "sat_tiler.py");

export interface SatSettings {
  /** Time limit including building the formula; the process is killed after it. */
  readonly seconds: number;
}

let pythonPath: string | undefined;

/** The interpreter of the script's uv environment, resolved once so it can be killed directly. */
function satPython(): string {
  pythonPath ??= execFileSync(
    "uv",
    ["run", "--quiet", SCRIPT_PATH, "--print-python"],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  if (pythonPath === "") throw new Error("uv returned no Python path");
  return pythonPath;
}

/**
 * Searches a rectangle with the SAT tiler (tools/sat/sat_tiler.py, in its uv environment). Results use
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
    orientations: orientations.map((o) =>
      polyomino.oriented(o).cells.map((cell) => [cell.x, cell.y]),
    ),
  };
  return new Promise((resolve, reject) => {
    const child = spawn(satPython(), [SCRIPT_PATH], { windowsHide: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, settings.seconds * 1000);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ kind: "budget", nodes: 0 });
        return;
      }
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
