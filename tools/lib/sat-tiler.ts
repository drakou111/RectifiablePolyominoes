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

const pythonPaths = new Map<string, string>();

/**
 * The interpreter of a uv script's environment, resolved once so the script can be run (and
 * killed) directly. The script must print sys.executable when given --print-python.
 */
export function uvScriptPython(scriptPath: string): string {
  const known = pythonPaths.get(scriptPath);
  if (known !== undefined) return known;
  const path = execFileSync(
    "uv",
    ["run", "--quiet", scriptPath, "--print-python"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  ).trim();
  if (path === "")
    throw new Error(`uv returned no Python path for ${scriptPath}`);
  pythonPaths.set(scriptPath, path);
  return path;
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
    const child = spawn(uvScriptPython(SCRIPT_PATH), [SCRIPT_PATH], {
      windowsHide: true,
    });
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
