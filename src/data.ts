import { Catalog, parseTilingPath } from "./core/catalog";
import type {
  PolyominoEntry,
  Reference,
  SizeTotals,
  TilingFile,
} from "./core/model";
// All entry files as one module (see vite.config.ts): thousands of separate imports load slowly in dev.
import entryList from "virtual:polyomino-entries";

const DATA_PREFIX = "/data/";

const referenceModules: Record<
  string,
  Record<string, Reference>
> = import.meta.glob("/data/references.json", {
  eager: true,
  import: "default",
});
// Tilings can be large, so each one becomes its own chunk, fetched when a page shows it.
const tilingLoaders = import.meta.glob<TilingFile>("/data/tilings/**/*.json", {
  import: "default",
});

const relative = (path: string): string => path.slice(DATA_PREFIX.length);

export function loadCatalog(): Catalog {
  const entries = new Map<string, PolyominoEntry>();
  for (const entry of entryList) entries.set(entry.id, entry);
  const tilings = Object.keys(tilingLoaders).map((path) =>
    parseTilingPath(relative(path)),
  );
  return new Catalog(entries, tilings);
}

const sizeModules: Record<string, SizeTotals> = import.meta.glob(
  "/data/sizes.json",
  { eager: true, import: "default" },
);

export function loadSizeTotals(): SizeTotals {
  const totals = Object.values(sizeModules)[0];
  if (totals === undefined) throw new Error("data/sizes.json is missing");
  return totals;
}

export function loadReferences(): ReadonlyMap<string, Reference> {
  const file = Object.values(referenceModules)[0] ?? {};
  return new Map(Object.entries(file));
}

export async function loadTiling(path: string): Promise<TilingFile> {
  const loader = tilingLoaders[DATA_PREFIX + path];
  if (loader === undefined) throw new Error(`No tiling file at data/${path}`);
  return loader();
}
