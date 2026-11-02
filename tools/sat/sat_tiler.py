# /// script
# requires-python = ">=3.12"
# dependencies = ["python-sat>=1.8.dev0"]
# ///
"""Tiles a rectangle with copies of a polyomino by handing exact cover to a SAT solver.

Reads one job as JSON on stdin (the caller is tools/lib/sat-tiler.ts):
  {"width": W, "height": H, "orientations": [[[x, y], ...], ...]}
and prints one JSON line in the native tiler's format:
  {"result": "found", "nodes": 0, "placements": [[orientation index, x, y], ...]}
  {"result": "exhausted", "nodes": 0}   the solver proved no tiling exists
One variable per placement; each cell is covered exactly once (sequential-counter encoding).
There is no time limit here: pysat cannot interrupt CaDiCaL, so the caller kills the process.
With --print-python it prints the interpreter path instead, so callers can skip uv next time.
"""

import json
import sys
from dataclasses import dataclass

from pysat.card import CardEnc, EncType
from pysat.solvers import Solver

SOLVER_NAME = "cadical195"


@dataclass(frozen=True)
class Job:
    width: int
    height: int
    orientations: list[list[tuple[int, int]]]


def read_job() -> Job:
    raw = json.load(sys.stdin)
    width, height = raw["width"], raw["height"]
    if not (
        isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0
    ):
        raise ValueError(f"bad rectangle {width} x {height}")
    orientations = [
        [(int(x), int(y)) for x, y in cells] for cells in raw["orientations"]
    ]
    if not orientations or any(not cells for cells in orientations):
        raise ValueError("orientations must be non-empty cell lists")
    return Job(width, height, orientations)


def solve(job: Job) -> dict[str, object]:
    size = len(job.orientations[0])
    if (job.width * job.height) % size != 0:
        return {"result": "exhausted", "nodes": 0}
    placements: list[tuple[int, int, int]] = []
    covering: list[list[int]] = [[] for _ in range(job.width * job.height)]
    for index, cells in enumerate(job.orientations):
        cell_width = max(x for x, _ in cells) + 1
        cell_height = max(y for _, y in cells) + 1
        for y in range(job.height - cell_height + 1):
            for x in range(job.width - cell_width + 1):
                placements.append((index, x, y))
                variable = len(placements)
                for cx, cy in cells:
                    covering[(y + cy) * job.width + x + cx].append(variable)
    if any(not variables for variables in covering):
        return {"result": "exhausted", "nodes": 0}

    with Solver(name=SOLVER_NAME) as solver:
        top = len(placements)
        for variables in covering:
            encoded = CardEnc.equals(
                lits=variables, bound=1, top_id=top, encoding=EncType.seqcounter
            )
            top = max(top, encoded.nv)
            solver.append_formula(encoded.clauses)
        if not solver.solve():
            return {"result": "exhausted", "nodes": 0}
        chosen = [
            list(placements[v - 1])
            for v in solver.get_model()
            if 0 < v <= len(placements)
        ]
    return {"result": "found", "nodes": 0, "placements": chosen}


def main() -> None:
    if "--print-python" in sys.argv:
        print(sys.executable)
        return
    print(json.dumps(solve(read_job()), separators=(",", ":")))


if __name__ == "__main__":
    main()
