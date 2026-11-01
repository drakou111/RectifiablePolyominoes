import { describe, expect, it } from "vitest";
import { validateData, type DataFile } from "../src/core/validate";

const references: DataFile = {
  path: "references.json",
  content: {
    "some-paper": {
      kind: "publication",
      authors: ["A. Author"],
      title: "A paper",
      url: "https://example.org",
      checked: true,
    },
  },
};

const lEntry = (properties: object): DataFile => ({
  path: "polyominoes/4/e080.json",
  content: { id: "e080", properties },
});

// L-tetromino in a 4x2 box: canonical copy plus a copy turned 180 degrees.
const lTiling = (placements: object[]): DataFile => ({
  path: "tilings/e080/4x2.json",
  content: { width: 4, height: 2, placements, ref: "some-paper" },
});
const GOOD_PLACEMENTS = [
  { o: 0, x: 0, y: 0 },
  { o: 2, x: 1, y: 0 },
];

function errorsOf(
  entries: DataFile[],
  tilings: DataFile[] = [],
): readonly string[] {
  return validateData(references, entries, tilings).errors;
}

describe("validateData", () => {
  it("accepts consistent data", () => {
    const entry = lEntry({
      rectifiable: { status: "proven", value: true, ref: "some-paper" },
      order: { status: "proven", value: 2, ref: "some-paper" },
      smallestRectangles: {
        status: "proven",
        value: [[4, 2]],
        ref: "some-paper",
      },
      minColors: { status: "proven", value: 2, ref: "some-paper" },
    });
    expect(errorsOf([entry], [lTiling(GOOD_PLACEMENTS)])).toEqual([]);
  });

  it("rejects non-canonical IDs and wrong folders", () => {
    const errors = errorsOf([
      {
        path: "polyominoes/4/80e0.json",
        content: { id: "80e0", properties: {} },
      },
      { path: "polyominoes/5/f0.json", content: { id: "f0", properties: {} } },
    ]);
    expect(errors.join("\n")).toMatch(/not canonical; use "e080"/);
    expect(errors.join("\n")).toMatch(/has 4 cells but sits in folder 5/);
  });

  it("requires refs, values and known fields", () => {
    const errors = errorsOf([
      lEntry({
        order: { status: "proven", value: 2 },
        oddOrder: { status: "open", value: 3, ref: "some-paper" },
        tilesPlane: {
          status: "proven",
          value: true,
          ref: "missing-paper",
          colour: "red",
        },
        sparkle: { status: "open" },
      }),
    ]).join("\n");
    expect(errors).toMatch(/order\]: a settled property needs a ref/);
    expect(errors).toMatch(/oddOrder\]: an open property cannot have a value/);
    expect(errors).toMatch(/unknown reference "missing-paper"/);
    expect(errors).toMatch(/unknown field "colour"/);
    expect(errors).toMatch(/sparkle\]: unknown property/);
  });

  it("checks seeAlso keys and reference kinds", () => {
    const errors = validateData(
      {
        path: "references.json",
        content: {
          "no-kind": {
            authors: ["B"],
            title: "T",
            url: "https://x.org",
            checked: true,
          },
        },
      },
      [
        {
          path: "polyominoes/4/e080.json",
          content: {
            id: "e080",
            seeAlso: ["no-kind", "missing"],
            properties: {},
          },
        },
      ],
      [],
    ).errors.join("\n");
    expect(errors).toMatch(
      /\[no-kind\]: kind must be one of publication, website/,
    );
    expect(errors).toMatch(/\[seeAlso\]: unknown reference "missing"/);
  });

  it("rejects values that contradict the shape", () => {
    const errors = errorsOf([
      {
        path: "polyominoes/8/e0a0e0.json",
        content: {
          id: "e0a0e0",
          properties: {
            rectifiable: { status: "proven", value: true, ref: "some-paper" },
          },
        },
      },
    ]);
    expect(errors.join("\n")).toMatch(/contradicts the shape: It has a hole/);
  });

  it("finds broken tilings", () => {
    const errors = errorsOf(
      [lEntry({})],
      [
        lTiling([
          { o: 0, x: 0, y: 0 },
          { o: 0, x: 1, y: 0 },
        ]),
      ],
    ).join("\n");
    expect(errors).toMatch(/overlap/);
    expect(errors).toMatch(/not covered/);
  });

  it("finds tilings that contradict the entry", () => {
    const entry = lEntry({
      order: { status: "proven", value: 4, ref: "some-paper" },
      minColors: { status: "proven", value: 3, ref: "some-paper" },
    });
    const errors = errorsOf([entry], [lTiling(GOOD_PLACEMENTS)]).join("\n");
    expect(errors).toMatch(/uses 2 copies, fewer than the order 4/);
    expect(errors).toMatch(
      /can be colored with 2 colors, fewer than minColors 3/,
    );
  });

  it("checks that the smallest rectangle matches the order", () => {
    const entry = lEntry({
      order: { status: "proven", value: 2, ref: "some-paper" },
      smallestRectangles: {
        status: "proven",
        value: [[4, 4]],
        ref: "some-paper",
      },
    });
    expect(errorsOf([entry]).join("\n")).toMatch(/does not hold exactly order/);
  });
});
