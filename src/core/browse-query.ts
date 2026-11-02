import type { CatalogItem } from "./catalog";
import { isNotApplicable, type PropertyKey } from "./model";

/** How a property stands for one piece, as the browse table shows it. */
export type Standing = "yes" | "no" | "value" | "open" | "none" | "na";

/** Properties whose value is true or false; the rest are numbers or lists. */
export const YES_NO_KEYS: ReadonlySet<PropertyKey> = new Set([
  "rectifiable",
  "tilesHalfStrip",
  "tilesPlane",
]);

export const PROPERTY_FILTER_OPTIONS: Record<
  "yesNo" | "valued",
  readonly (readonly [Standing | "any", string])[]
> = {
  yesNo: [
    ["any", "any"],
    ["yes", "yes"],
    ["no", "no"],
    ["open", "open"],
    ["none", "no data"],
  ],
  valued: [
    ["any", "any"],
    ["value", "known"],
    ["open", "open"],
    ["none", "no data"],
    ["na", "n/a"],
  ],
};

export function standing(item: CatalogItem, key: PropertyKey): Standing {
  const record = item.properties[key];
  if (record === undefined)
    return isNotApplicable(key, item.properties) ? "na" : "none";
  if (record.status === "open") return "open";
  if (record.value === true) return "yes";
  if (record.value === false) return "no";
  return "value";
}

/** Sortable columns: the piece's own facts, then any property. */
export type SortColumn = "size" | "id" | "symmetry" | "tilings" | PropertyKey;

/** Rank of each standing when sorting: answers first, then open, then nothing. */
const STANDING_RANK: Record<Standing, number> = {
  yes: 0,
  no: 1,
  value: 0,
  open: 2,
  none: 3,
  na: 4,
};

/** A number to order by within a standing: the value, or an open record's best bound. */
function magnitude(item: CatalogItem, key: PropertyKey): number {
  const record = item.properties[key];
  if (record === undefined) return 0;
  const value = record.value as unknown;
  if (typeof value === "number") return value;
  // "none" (no odd tiling, no square) sorts after every number.
  if (value === "none") return Number.MAX_SAFE_INTEGER;
  if (Array.isArray(value)) {
    const [first] = value as readonly (readonly [number, number])[];
    return first === undefined ? 0 : first[0] * first[1];
  }
  if (typeof value === "object" && value !== null && "rectangles" in value)
    return (value as { rectangles: readonly unknown[] }).rectangles.length;
  return record.lower ?? record.upper ?? 0;
}

/**
 * Compares two pieces by a column. Descending reverses the answers but keeps open and missing
 * data last, so the interesting rows stay on top. Ties keep catalogue order (cells, then ID).
 */
export function compareBy(
  column: SortColumn,
  descending: boolean,
): (a: CatalogItem, b: CatalogItem) => number {
  const sign = descending ? -1 : 1;
  if (column === "size") return (a, b) => sign * (a.size - b.size);
  if (column === "id")
    return (a, b) => sign * (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (column === "symmetry")
    return (a, b) =>
      sign * (a.symmetry < b.symmetry ? -1 : a.symmetry > b.symmetry ? 1 : 0);
  if (column === "tilings")
    return (a, b) => sign * (a.tilings.length - b.tilings.length);
  return (a, b) => {
    const sa = standing(a, column);
    const sb = standing(b, column);
    const rank = STANDING_RANK[sa] - STANDING_RANK[sb];
    const answered = (s: Standing): boolean => STANDING_RANK[s] <= 1;
    if (!answered(sa) || !answered(sb)) {
      // Open and missing rows stay last in both directions; open ones by their bound.
      if (rank !== 0) return rank;
      return sa === "open" ? magnitude(a, column) - magnitude(b, column) : 0;
    }
    if (rank !== 0) return sign * rank;
    return sign * (magnitude(a, column) - magnitude(b, column));
  };
}

/** Sorts a copy; Array.prototype.sort is stable, so ties keep their order. */
export function sortItems(
  items: readonly CatalogItem[],
  column: SortColumn,
  descending: boolean,
): CatalogItem[] {
  return [...items].sort(compareBy(column, descending));
}
