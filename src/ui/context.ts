import type { Catalog } from "../core/catalog";
import type { Reference, SizeTotals } from "../core/model";

export interface SiteContext {
  readonly catalog: Catalog;
  readonly references: ReadonlyMap<string, Reference>;
  /** How many free polyominoes each classified size has (data/sizes.json). */
  readonly sizeTotals: SizeTotals;
}

export function polyominoHref(id: string): string {
  return `#/p/${id}`;
}
