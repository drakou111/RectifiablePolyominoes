import type { CatalogItem } from "./catalog";

/** One size's pieces split the way its page shows them. */
export interface SizeSummary {
  readonly size: number;
  /** Rectangle question or order still open (or missing): listed first. */
  readonly unknown: readonly CatalogItem[];
  /** Tile a rectangle with a known order, highest order first. */
  readonly tilers: readonly CatalogItem[];
  /** Tile no rectangle: counted, not listed. */
  readonly nonTilers: number;
}

const byId = (a: CatalogItem, b: CatalogItem): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Pieces whose order is not settled, most promising (highest lower bound) first. */
function unknownFirst(a: CatalogItem, b: CatalogItem): number {
  const lower = (item: CatalogItem): number =>
    item.properties.order?.lower ?? 0;
  return lower(b) - lower(a) || byId(a, b);
}

export function summarizeSize(
  items: readonly CatalogItem[],
  size: number,
): SizeSummary {
  const unknown: CatalogItem[] = [];
  const tilers: CatalogItem[] = [];
  let nonTilers = 0;
  for (const item of items) {
    if (item.size !== size) continue;
    const { rectifiable, order } = item.properties;
    if (rectifiable?.value === false) nonTilers++;
    else if (rectifiable?.value === true && order?.value !== undefined)
      tilers.push(item);
    else unknown.push(item);
  }
  const orderOf = (item: CatalogItem): number =>
    item.properties.order?.value ?? 0;
  tilers.sort((a, b) => orderOf(b) - orderOf(a) || byId(a, b));
  unknown.sort(unknownFirst);
  return { size, unknown, tilers, nonTilers };
}

/** Sizes present in the catalogue, smallest first. */
export function catalogueSizes(items: readonly CatalogItem[]): number[] {
  return [...new Set(items.map((item) => item.size))].sort((a, b) => a - b);
}
