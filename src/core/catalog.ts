import { compareIds } from "./enumerate";
import { deriveProperties, inferProperties } from "./derived";
import type {
  PolyominoEntry,
  Properties,
  PropertyKey,
  PropertyRecord,
} from "./model";
import { Polyomino, type SymmetryGroup } from "./polyomino";

function withInferred(properties: Properties): Properties {
  return { ...properties, ...inferProperties(properties) };
}

/**
 * Every polyomino up to this size was classified; the catalogue lists the ones that tile a
 * rectangle or are open. Must match "complete" in data/sizes.json.
 */
export const COMPLETE_SIZE = 17;

/** The rectangles with up to `maxSize` cells, as polyominoes; they need no entry. */
export function rectanglePieces(maxSize: number): Polyomino[] {
  const pieces: Polyomino[] = [];
  for (let size = 1; size <= maxSize; size++)
    for (let width = 1; width * width <= size; width++)
      if (size % width === 0) {
        const height = size / width;
        const cells = [];
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) cells.push({ x, y });
        pieces.push(Polyomino.fromCells(cells));
      }
  return pieces;
}

export interface TilingRef {
  readonly polyominoId: string;
  readonly width: number;
  readonly height: number;
  /** The "-label" part of the file name, such as "odd" or "3colors". */
  readonly label?: string;
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
  /** False for a piece built on demand by Catalog.lookup. */
  readonly listed: boolean;
}

/** Why a classified piece missing from the catalogue tiles no rectangle. */
export function unlistedRecord(completeSize: number): PropertyRecord<boolean> {
  return {
    status: "computed",
    value: false,
    reason: `Every polyomino with up to ${completeSize} cells was classified, and the catalogue lists all that tile a rectangle or are open. This one is not listed, so it was shown to tile no rectangle; the proof for each piece is kept in the classification record, not on this site.`,
  };
}

function buildItem(
  id: string,
  polyomino: Polyomino,
  entry: PolyominoEntry | undefined,
  tilings: readonly TilingRef[],
  listed: boolean,
  extra: Properties = {},
): CatalogItem {
  const derived = { ...deriveProperties(polyomino), ...extra };
  const merged = { ...derived, ...entry?.properties };
  return {
    id,
    polyomino,
    size: polyomino.size,
    entry,
    properties: withInferred(merged),
    derivedKeys: new Set([
      ...(Object.keys(derived) as PropertyKey[]),
      ...(Object.keys(inferProperties(merged)) as PropertyKey[]),
    ]),
    symmetry: polyomino.symmetryGroup(),
    hasHole: polyomino.hasHole(),
    tilings: [...tilings].sort(
      (a, b) => a.width * a.height - b.width * b.height,
    ),
    listed,
  };
}

export class Catalog {
  readonly items: readonly CatalogItem[];
  private readonly byId: ReadonlyMap<string, CatalogItem>;
  private readonly completeSize: number;

  constructor(
    entries: ReadonlyMap<string, PolyominoEntry>,
    tilings: readonly TilingRef[],
    completeSize = COMPLETE_SIZE,
  ) {
    const shapes = new Map<string, Polyomino>();
    for (const shape of rectanglePieces(completeSize))
      shapes.set(shape.id, shape);
    for (const id of entries.keys())
      if (!shapes.has(id)) shapes.set(id, Polyomino.fromId(id));

    const tilingsById = new Map<string, TilingRef[]>();
    for (const tiling of tilings) {
      const list = tilingsById.get(tiling.polyominoId) ?? [];
      list.push(tiling);
      tilingsById.set(tiling.polyominoId, list);
    }

    const items: CatalogItem[] = [];
    for (const [id, polyomino] of shapes)
      items.push(
        buildItem(
          id,
          polyomino,
          entries.get(id),
          tilingsById.get(id) ?? [],
          true,
        ),
      );
    items.sort((a, b) => a.size - b.size || compareIds(a.id, b.id));
    this.items = items;
    this.byId = new Map(items.map((item) => [item.id, item]));
    this.completeSize = completeSize;
  }

  get(id: string): CatalogItem | undefined {
    return this.byId.get(id);
  }

  /**
   * Like get, but also builds an item for a valid piece the catalogue does not list. Up to the
   * complete size such a piece was classified as tiling no rectangle; above it nothing is known.
   * Returns undefined for a malformed, disconnected or non-canonical ID.
   */
  lookup(id: string): CatalogItem | undefined {
    const listed = this.byId.get(id);
    if (listed !== undefined) return listed;
    let polyomino: Polyomino;
    try {
      polyomino = Polyomino.fromId(id);
    } catch {
      // The ID comes from the address bar: a bad one gets the not-found page, not a crash.
      return undefined;
    }
    if (polyomino.id !== id) return undefined;
    const classified =
      polyomino.size <= this.completeSize &&
      !polyomino.hasHole() &&
      !polyomino.isRectangle();
    return buildItem(
      id,
      polyomino,
      undefined,
      [],
      false,
      classified ? { rectifiable: unlistedRecord(this.completeSize) } : {},
    );
  }

  get maxSize(): number {
    return this.items.reduce((max, item) => Math.max(max, item.size), 0);
  }
}

/** Parses "tilings/<id>/<w>x<h>[-label].json" into a TilingRef. */
export function parseTilingPath(path: string): TilingRef {
  const match = /^tilings\/([^/]+)\/(\d+)x(\d+)(?:-([a-z0-9-]+))?\.json$/.exec(
    path,
  );
  if (match === null) throw new Error(`Bad tiling path "${path}"`);
  const [, polyominoId, width, height, label] = match as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
  ];
  return {
    polyominoId,
    width: Number(width),
    height: Number(height),
    path,
    ...(label !== undefined && { label }),
  };
}
