import { expect, it } from "vitest";
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

// OEIS A054361: polyominoes without holes that do not tile the plane, n = 7..10. Pieces with
// holes get their "no" by derivation, so stored records count only holeless pieces.
const HOLELESS_NON_TILERS: Record<string, number> = {
  "7": 3,
  "8": 20,
  "9": 198,
  "10": 1390,
};

it("stored plane non-tilers match OEIS A054361", () => {
  const entries = import.meta.glob<{
    properties?: { tilesPlane?: { value?: boolean } };
  }>("/data/polyominoes/**/*.json", { eager: true, import: "default" });
  const counts: Record<string, number> = {};
  for (const [path, entry] of Object.entries(entries)) {
    const size = path.split("/")[3] as string;
    if (entry.properties?.tilesPlane?.value === false)
      counts[size] = (counts[size] ?? 0) + 1;
  }
  for (const [size, expected] of Object.entries(HOLELESS_NON_TILERS))
    expect([size, counts[size]]).toEqual([size, expected]);
});
