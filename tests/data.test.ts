import { expect, it } from "vitest";
import { COMPLETE_SIZE } from "../src/core/catalog";
import type { PolyominoEntry, SizeTotals } from "../src/core/model";
import { validateData, type DataFile } from "../src/core/validate";

const DATA_PREFIX = "/data/";

function filesFrom(modules: Record<string, unknown>): DataFile[] {
  return Object.entries(modules).map(([path, content]) => ({
    path: path.slice(DATA_PREFIX.length),
    content,
  }));
}

// The real data/ folder. Any error here means a hand-entered file needs fixing.
it("data/ is valid", () => {
  const references = filesFrom(
    import.meta.glob("/data/references.json", {
      eager: true,
      import: "default",
    }),
  );
  const entries = filesFrom(
    import.meta.glob("/data/polyominoes/**/*.json", {
      eager: true,
      import: "default",
    }),
  );
  const tilings = filesFrom(
    import.meta.glob("/data/tilings/**/*.json", {
      eager: true,
      import: "default",
    }),
  );
  expect(references).toHaveLength(1);
  const result = validateData(references[0] as DataFile, entries, tilings);
  expect(result.errors).toEqual([]);
});

// OEIS A000105 (free polyominoes) and A001419 (free polyominoes with holes).
const FREE_POLYOMINOES = [
  1, 1, 2, 5, 12, 35, 108, 369, 1285, 4655, 17073, 63600, 238591,
];
const WITH_HOLES = [0, 0, 0, 0, 0, 0, 1, 6, 37, 195, 979, 4663, 21474];

const sizeFile = Object.values(
  import.meta.glob<SizeTotals>("/data/sizes.json", {
    eager: true,
    import: "default",
  }),
)[0];

it("data/sizes.json matches the known counts", () => {
  expect(sizeFile?.complete).toBe(COMPLETE_SIZE);
  for (let size = 1; size <= COMPLETE_SIZE; size++)
    expect([size, sizeFile?.sizes[String(size)]]).toEqual([
      size,
      {
        total: FREE_POLYOMINOES[size - 1],
        withHoles: WITH_HOLES[size - 1],
      },
    ]);
});

it("keeps only pieces that tile a rectangle or are open", () => {
  const entries = import.meta.glob<PolyominoEntry>(
    "/data/polyominoes/**/*.json",
    { eager: true, import: "default" },
  );
  const excluded = Object.values(entries)
    .filter((entry) => {
      const rectifiable = entry.properties.rectifiable;
      return rectifiable?.value !== true && rectifiable?.status !== "open";
    })
    .map((entry) => entry.id);
  expect(excluded).toEqual([]);
});
