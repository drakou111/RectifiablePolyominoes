import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Polyomino } from "../../src/core/polyomino";
import { uvScriptPython } from "./sat-tiler";
import { PROJECT_ROOT } from "./store";

const SCRIPT_PATH = join(PROJECT_ROOT, "tools", "sat", "plane_sat.py");

export type PlaneStep = readonly ["torus", number] | readonly ["cover", number];

export type PlaneSatResult =
  | {
      readonly kind: "tiles";
      readonly a: number;
      readonly b: number;
      readonly c: number;
      readonly copies: number;
    }
  | { readonly kind: "no"; readonly side: number }
  /** Every step ran without a verdict, or the time limit ran out. */
  | { readonly kind: "undecided" };

/** Torus steps up to each cover side's copy count, then the cover test, then the rest. */
export function planeSchedule(
  maxCopies: number,
  sides: readonly number[],
): PlaneStep[] {
  const schedule: PlaneStep[] = [];
  const sorted = [...sides].sort((x, y) => x - y);
  let copies = 1;
  sorted.forEach((side, i) => {
    const until = Math.round((maxCopies * (i + 1)) / (sorted.length + 1));
    for (; copies <= until; copies++) schedule.push(["torus", copies]);
    schedule.push(["cover", side]);
  });
  for (; copies <= maxCopies; copies++) schedule.push(["torus", copies]);
  return schedule;
}

/**
 * Runs the steps in order: ["torus", k] tries every period lattice with k copies per period,
 * ["cover", s] asks whether copies can cover an s x s square. A torus tiling is checked here
 * before it is reported.
 */
export function decidePlaneSat(
  polyomino: Polyomino,
  schedule: readonly PlaneStep[],
  seconds: number,
): Promise<PlaneSatResult> {
  const orientations = polyomino.distinctOrientations();
  const cellLists = orientations.map((o) =>
    polyomino.oriented(o).cells.map((cell) => [cell.x, cell.y] as const),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(uvScriptPython(SCRIPT_PATH), [SCRIPT_PATH], {
      windowsHide: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, seconds * 1000);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ kind: "undecided" });
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `plane_sat failed on ${polyomino.id} (exit ${code}): ${Buffer.concat(stderr).toString("utf8").slice(-500)}`,
          ),
        );
        return;
      }
      try {
        resolve(
          parsePlaneOutput(
            Buffer.concat(stdout).toString("utf8"),
            cellLists,
            polyomino.size,
          ),
        );
      } catch (error) {
        reject(error as Error);
      }
    });
    child.stdin.end(JSON.stringify({ orientations: cellLists, schedule }));
  });
}

/** Parses plane_sat output; a torus tiling must cover its fundamental domain exactly once. */
export function parsePlaneOutput(
  stdout: string,
  cellLists: readonly (readonly (readonly [number, number])[])[],
  size: number,
): PlaneSatResult {
  const parsed = JSON.parse(stdout) as {
    result: string;
    a?: number;
    b?: number;
    c?: number;
    side?: number;
    placements?: [number, number, number][];
  };
  if (parsed.result === "undecided") return { kind: "undecided" };
  if (parsed.result === "no" && Number.isInteger(parsed.side))
    return { kind: "no", side: parsed.side as number };
  const { a, b, c, placements } = parsed;
  if (
    parsed.result !== "tiles" ||
    a === undefined ||
    b === undefined ||
    c === undefined ||
    placements === undefined
  )
    throw new Error(`unexpected plane_sat output: ${stdout.slice(0, 200)}`);
  const area = a * c;
  const hits = new Uint8Array(area);
  const index = (x: number, y: number): number => {
    const q = Math.floor(y / c);
    const r = (((x - q * b) % a) + a) % a;
    return (y - q * c) * a + r;
  };
  for (const [o, x, y] of placements) {
    const cells = cellLists[o];
    if (cells === undefined)
      throw new Error(`plane_sat returned orientation index ${o}`);
    for (const [cx, cy] of cells) {
      const cell = index(x + cx, y + cy);
      hits[cell] = (hits[cell] as number) + 1;
    }
  }
  if (hits.some((count) => count !== 1))
    throw new Error(
      `plane_sat torus tiling (${a}, 0), (${b}, ${c}) does not cover the torus exactly once`,
    );
  return { kind: "tiles", a, b, c, copies: area / size };
}
