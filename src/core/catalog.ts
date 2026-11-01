import { compareIds, enumerateFreePolyominoes } from "./enumerate";
import { deriveProperties, inferProperties } from "./derived";

function withInferred(properties: Properties): Properties {
  return { ...properties, ...inferProperties(properties) };
}
import type { PolyominoEntry, Properties, PropertyKey } from "./model";
import { Polyomino, type SymmetryGroup } from "./polyomino";

/** Every n-omino up to this size gets a page, data or not. */
export const MAX_GENERATED_SIZE = 10;

export interface TilingRef {
  readonly polyominoId: string;
  readonly width: number;
  readonly height: number;
  /** Path relative to data/, used to lazy-load the file. */
  readonly path: string;
}

export interface CatalogItem {
  readonly id: string;
  readonly polyomino: Polyomino;
  readonly size: number;
  readonly entry: PolyominoEntry | undefined;
  /** Derived facts merged with hand-entered ones (hand-entered wins). */
  readonly properties: Properties;
  readonly derivedKeys: ReadonlySet<PropertyKey>;
  readonly symmetry: SymmetryGroup;
  readonly hasHole: boolean;
  readonly tilings: readonly TilingRef[];
}

export class Catalog {
  readonly items: readonly CatalogItem[];
  private readonly byId: ReadonlyMap<string, CatalogItem>;

  constructor(
    entries: ReadonlyMap<string, PolyominoEntry>,
    tilings: readonly TilingRef[],
    maxGeneratedSize = MAX_GENERATED_SIZE,
  ) {
    const shapes = new Map<string, Polyomino>();
    for (const group of enumerateFreePolyominoes(maxGeneratedSize))
      for (const shape of group) shapes.set(shape.id, shape);
    for (const id of entries.keys())
      if (!shapes.has(id)) shapes.set(id, Polyomino.fromId(id));

    const tilingsById = new Map<string, TilingRef[]>();
    for (const tiling of tilings) {
      const list = tilingsById.get(tiling.polyominoId) ?? [];
      list.push(tiling);
      tilingsById.set(tiling.polyominoId, list);
    }

    const items: CatalogItem[] = [];
    for (const [id, polyomino] of shapes) {
      const entry = entries.get(id);
      const derived = deriveProperties(polyomino);
      items.push({
        id,
        polyomino,
        size: polyomino.size,
        entry,
        properties: withInferred({ ...derived, ...entry?.properties }),
        derivedKeys: new Set([
          ...(Object.keys(derived) as PropertyKey[]),
          ...(Object.keys(
            inferProperties({ ...derived, ...entry?.properties }),
          ) as PropertyKey[]),
        ]),
        symmetry: polyomino.symmetryGroup(),
        hasHole: polyomino.hasHole(),
        tilings: (tilingsById.get(id) ?? []).sort(
          (a, b) => a.width * a.height - b.width * b.height,
        ),
      });
    }
    items.sort((a, b) => a.size - b.size || compareIds(a.id, b.id));
    this.items = items;
    this.byId = new Map(items.map((item) => [item.id, item]));
  }

  get(id: string): CatalogItem | undefined {
    return this.byId.get(id);
  }

  get maxSize(): number {
    return this.items.reduce((max, item) => Math.max(max, item.size), 0);
  }
}

/** Parses "tilings/<id>/<w>x<h>[-label].json" into a TilingRef. */
export function parseTilingPath(path: string): TilingRef {
  const match = /^tilings\/([^/]+)\/(\d+)x(\d+)(?:-[a-z0-9-]+)?\.json$/.exec(
    path,
  );
  if (match === null) throw new Error(`Bad tiling path "${path}"`);
  const [, polyominoId, width, height] = match as unknown as [
    string,
    string,
    string,
    string,
  ];
  return { polyominoId, width: Number(width), height: Number(height), path };
}
