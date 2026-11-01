import { describe, expect, it } from "vitest";
import { Polyomino } from "../src/core/polyomino";

describe("Polyomino IDs", () => {
  it.each([
    ["fe70", [".###...", "#######"]],
    ["f840", ["#####", ".#..."]],
    ["f860", ["#####", ".##.."]],
    ["e070", [".###", "###."]],
    ["e0b0", ["#.##", "###."]],
    ["f08080", ["#...", "#...", "####"]],
  ])("reproduces Dahlke's name %s from any orientation", (id, rows) => {
    const shape = Polyomino.fromRows(rows);
    for (let k = 0; k < 8; k++) expect(shape.oriented(k).id).toBe(id);
  });

  it("round-trips through fromId", () => {
    const shape = Polyomino.fromId("fe70");
    expect(shape.encode()).toBe("fe70");
    expect(shape.size).toBe(10);
    expect([shape.width, shape.height]).toEqual([7, 2]);
  });

  it("uses the wide form beyond 8 columns", () => {
    const bar = Polyomino.fromRows(["##########"]);
    expect(bar.id).toBe("xffc0");
    expect(Polyomino.fromId("xffc0").equals(bar)).toBe(true);
    const wideL = Polyomino.fromRows(["#########", "#........"]);
    expect(wideL.id).toBe("xff80.8000");
    expect(Polyomino.fromId(wideL.id).size).toBe(10);
  });

  it("rejects malformed or disconnected IDs", () => {
    expect(() => Polyomino.fromId("fg")).toThrow(/Malformed/);
    expect(() => Polyomino.fromId("abc")).toThrow(/Malformed/);
    expect(() => Polyomino.fromId("a0")).toThrow(/not edge-connected/);
    expect(() => Polyomino.fromId("")).toThrow();
  });
});

describe("Polyomino geometry", () => {
  it("detects holes", () => {
    expect(Polyomino.fromRows(["###", "#.#", "###"]).hasHole()).toBe(true);
    expect(Polyomino.fromRows(["###", "#.#", "#.#"]).hasHole()).toBe(false);
    // A gap at a corner does not open the hole: only edge moves count.
    expect(Polyomino.fromRows([".##", "#.#", "###"]).hasHole()).toBe(true);
  });

  it.each([
    [["##", "##"], "D4"],
    [["####"], "D2"],
    [[".#.", "###", ".#."], "D4"],
    [["##.", ".##"], "C2"],
    [["###", ".#."], "D1"],
    [["##", "#."], "D1 diagonal"],
    [["#..", "###"], "C1"],
    [[".#..", ".###", "###.", "..#."], "C4"],
    [["#..", "##.", ".##"], "D1 diagonal"],
  ])("finds the symmetry group of %j", (rows, group) => {
    expect(Polyomino.fromRows(rows).symmetryGroup()).toBe(group);
  });

  it("counts distinct orientations", () => {
    expect(Polyomino.fromId("fe70").distinctOrientations()).toHaveLength(8);
    expect(Polyomino.fromRows(["####"]).distinctOrientations()).toHaveLength(2);
    expect(
      Polyomino.fromRows(["##", "##"]).distinctOrientations(),
    ).toHaveLength(1);
  });
});
