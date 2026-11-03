import { describe, expect, it } from "vitest";
import { Catalog } from "../src/core/catalog";

const COMPLETE_SIZE = 15;
const L_15 = "xffe0.8000.8000.8000.8000";

function catalog(): Catalog {
  return new Catalog(
    new Map([["fe70", { id: "fe70", properties: {} }]]),
    [],
    COMPLETE_SIZE,
  );
}

describe("Catalog.lookup", () => {
  it("returns listed items unchanged", () => {
    const shown = catalog();
    expect(shown.lookup("fe70")).toBe(shown.get("fe70"));
    expect(shown.get("fe70")?.listed).toBe(true);
  });

  it("marks an unlisted classified piece as tiling no rectangle", () => {
    const item = catalog().lookup(L_15);
    expect(item?.listed).toBe(false);
    expect(item?.size).toBe(15);
    expect(item?.properties.rectifiable).toMatchObject({
      status: "computed",
      value: false,
    });
    expect(item?.properties.rectifiable?.reason).toMatch(/up to 15 cells/);
    expect(item?.derivedKeys.has("rectifiable")).toBe(true);
  });

  it("knows nothing about an unlisted piece above the complete size", () => {
    const item = catalog().lookup("xfff0.8000.8000.8000.8000");
    expect(item?.listed).toBe(false);
    expect(item?.size).toBe(16);
    expect(item?.properties.rectifiable).toBeUndefined();
  });

  it("keeps the hole reason for an unlisted piece with a hole", () => {
    const item = catalog().lookup("e0a0e0");
    expect(item?.properties.rectifiable?.reason).toMatch(/hole/);
  });

  it("rejects malformed, disconnected and non-canonical IDs", () => {
    for (const id of ["zz", "", "a0", "x8000.8000.8000.8000.ffe0"])
      expect(catalog().lookup(id), id).toBeUndefined();
  });
});
