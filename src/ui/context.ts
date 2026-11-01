import type { Catalog } from "../core/catalog";
import type { Reference } from "../core/model";

export interface SiteContext {
  readonly catalog: Catalog;
  readonly references: ReadonlyMap<string, Reference>;
}

export function polyominoHref(id: string): string {
  return `#/p/${id}`;
}
