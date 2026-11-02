# /// script
# requires-python = ">=3.12"
# dependencies = ["python-sat>=1.8.dev0"]
# ///
"""Decides whether a polyomino tiles the plane with a SAT solver.

Reads one job as JSON on stdin (the caller is tools/plane-sat.ts):
  {"orientations": [[[x, y], ...], ...], "schedule": [["torus", copies] | ["cover", side], ...]}
Steps run in order:
  ["torus", k]  every torus Z^2 / <(a, 0), (b, c)> (Hermite normal form) of area k * size; a tiling
                of one repeats to a periodic tiling of the plane.
  ["cover", s]  can non-overlapping copies cover every cell of an s x s square (copies may stick
                out)? If not, the piece cannot tile the plane.
Prints one JSON line:
  {"result": "tiles", "a": a, "b": b, "c": c, "placements": [[orientation index, x, y], ...]}
  {"result": "no", "side": s}
  {"result": "undecided"}                    every step ran without a verdict
There is no time limit here: the caller kills the process.
"""

import json
import sys
from collections.abc import Iterator
from dataclasses import dataclass

from pysat.card import CardEnc, EncType
from pysat.solvers import Solver

SOLVER_NAME = "cadical195"
Cell = tuple[int, int]


@dataclass(frozen=True)
class Job:
    orientations: list[list[Cell]]
    schedule: list[tuple[str, int]]


def read_job() -> Job:
    raw = json.load(sys.stdin)
    orientations = [
        [(int(x), int(y)) for x, y in cells] for cells in raw["orientations"]
    ]
    if not orientations or any(not cells for cells in orientations):
        raise ValueError("orientations must be non-empty cell lists")
    schedule = [(str(kind), int(n)) for kind, n in raw["schedule"]]
    for kind, n in schedule:
        if kind not in ("torus", "cover") or n < 1:
            raise ValueError(f"bad schedule step {kind} {n}")
    return Job(orientations, schedule)


def solve_exact_cover(
    exactly_once: list[list[int]], at_most_once: list[list[int]], variable_count: int
) -> list[int] | None:
    """True variables of a model, or None when unsatisfiable."""
    if any(not lits for lits in exactly_once):
        return None
    with Solver(name=SOLVER_NAME) as solver:
        top = variable_count
        for lits in exactly_once:
            encoded = CardEnc.equals(
                lits=lits, bound=1, top_id=top, encoding=EncType.seqcounter
            )
            top = max(top, encoded.nv)
            solver.append_formula(encoded.clauses)
        for lits in at_most_once:
            if len(lits) < 2:
                continue
            encoded = CardEnc.atmost(
                lits=lits, bound=1, top_id=top, encoding=EncType.seqcounter
            )
            top = max(top, encoded.nv)
            solver.append_formula(encoded.clauses)
        if not solver.solve():
            return None
        return [v for v in solver.get_model() if 0 < v <= variable_count]


def lattices(area: int) -> Iterator[tuple[int, int, int]]:
    for a in range(1, area + 1):
        if area % a == 0:
            for b in range(a):
                yield a, b, area // a


def tile_torus(
    orientations: list[list[Cell]], a: int, b: int, c: int
) -> list[list[int]] | None:
    area = a * c

    def index(x: int, y: int) -> int:
        q = y // c
        return (y - q * c) * a + (x - q * b) % a

    placements: list[tuple[int, int, int]] = []
    covering: list[list[int]] = [[] for _ in range(area)]
    seen: set[frozenset[int]] = set()
    for o, cells in enumerate(orientations):
        for y in range(c):
            for x in range(a):
                covered = frozenset(index(x + cx, y + cy) for cx, cy in cells)
                if len(covered) < len(cells) or covered in seen:
                    continue
                seen.add(covered)
                placements.append((o, x, y))
                for cell in covered:
                    covering[cell].append(len(placements))
    chosen = solve_exact_cover(covering, [], len(placements))
    if chosen is None:
        return None
    return [list(placements[v - 1]) for v in chosen]


def cover_square(orientations: list[list[Cell]], side: int) -> bool:
    margin = max(max(max(x, y) for x, y in cells) for cells in orientations) + 1
    placements = 0
    covering: dict[Cell, list[int]] = {}
    for cells in orientations:
        for y in range(-margin, side + margin):
            for x in range(-margin, side + margin):
                shifted = [(x + cx, y + cy) for cx, cy in cells]
                if not any(0 <= px < side and 0 <= py < side for px, py in shifted):
                    continue
                if any(
                    not (-margin <= p < side + margin) for xy in shifted for p in xy
                ):
                    continue
                placements += 1
                for cell in shifted:
                    covering.setdefault(cell, []).append(placements)
    inside = [covering.get((x, y), []) for y in range(side) for x in range(side)]
    outside = [
        lits
        for (x, y), lits in covering.items()
        if not (0 <= x < side and 0 <= y < side)
    ]
    return solve_exact_cover(inside, outside, placements) is not None


def decide(job: Job) -> dict[str, object]:
    size = len(job.orientations[0])
    for kind, n in job.schedule:
        if kind == "torus":
            for a, b, c in lattices(n * size):
                placements = tile_torus(job.orientations, a, b, c)
                if placements is not None:
                    return {
                        "result": "tiles",
                        "a": a,
                        "b": b,
                        "c": c,
                        "placements": placements,
                    }
        elif not cover_square(job.orientations, n):
            return {"result": "no", "side": n}
        print(json.dumps({"progress": [kind, n]}), file=sys.stderr, flush=True)
    return {"result": "undecided"}


def main() -> None:
    if "--print-python" in sys.argv:
        print(sys.executable)
        return
    print(json.dumps(decide(read_job()), separators=(",", ":")))


if __name__ == "__main__":
    main()
