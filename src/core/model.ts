/** Types of the hand-entered JSON in data/. The validator (validate.ts) enforces them. */

export type Status = "proven" | "computed" | "open";

export const STATUSES: readonly Status[] = ["proven", "computed", "open"];

export const STATUS_DESCRIPTIONS: Record<Status, string> = {
  proven: "established by a published proof",
  computed: "established by computer search",
  open: "unknown",
};

export type RectangleSize = readonly [width: number, height: number];

export interface PrimeRectangles {
  readonly rectangles: readonly RectangleSize[];
  /** True when the list is known to contain every prime rectangle. */
  readonly complete: boolean;
}

export interface PropertyValues {
  readonly rectifiable: boolean;
  readonly order: number;
  readonly oddOrder: number | "none";
  readonly smallestRectangles: readonly RectangleSize[];
  readonly smallestSquare: number | "none";
  readonly primeRectangles: PrimeRectangles;
  readonly tilesHalfStrip: boolean;
  readonly tilesPlane: boolean;
  readonly minColors: number;
}

export type PropertyKey = keyof PropertyValues;

export interface PropertyRecord<V> {
  readonly status: Status;
  /** Required unless status is "open". */
  readonly value?: V;
  /** Bounds for numeric properties, mainly while open. */
  readonly lower?: number;
  readonly upper?: number;
  /** Key into data/references.json: the first publication of this result. */
  readonly ref?: string;
  /** Where in the reference, e.g. "Theorem 3" or "section 26". */
  readonly refDetail?: string;
  /** Short proof idea or method, e.g. "checkerboard coloring". */
  readonly reason?: string;
  readonly note?: string;
  /** True when `ref` is the data source, not yet traced back to the first publication. */
  readonly untraced?: boolean;
}

export type Properties = {
  readonly [K in PropertyKey]?: PropertyRecord<PropertyValues[K]>;
};

export interface PolyominoEntry {
  readonly id: string;
  readonly names?: readonly string[];
  readonly note?: string;
  /** Reference keys for sources that discuss this polyomino beyond the first publications of its results. */
  readonly seeAlso?: readonly string[];
  readonly properties: Properties;
}

/** One copy of the polyomino: orientation index (see transformCell) and top-left corner of its bounding box. */
export interface Placement {
  readonly o: number;
  readonly x: number;
  readonly y: number;
}

export interface TilingFile {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement[];
  readonly ref?: string;
  readonly note?: string;
}

export interface Tiling extends TilingFile {
  readonly polyominoId: string;
}

export type ReferenceKind = "publication" | "website";

export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  "publication",
  "website",
];

export interface Reference {
  /** Papers, books and manuscripts versus web pages, databases and software. */
  readonly kind: ReferenceKind;
  readonly authors: readonly string[];
  readonly title: string;
  readonly year?: number;
  /** Journal, book, arXiv, website... */
  readonly venue?: string;
  readonly volume?: string;
  readonly pages?: string;
  readonly doi?: string;
  readonly url?: string;
  /** False until someone has checked the details against the source. */
  readonly checked: boolean;
}

export interface PropertyDefinition {
  readonly key: PropertyKey;
  readonly label: string;
  readonly description: string;
  readonly numeric: boolean;
}

export const PROPERTY_DEFINITIONS: readonly PropertyDefinition[] = [
  {
    key: "rectifiable",
    label: "Tiles a rectangle",
    description:
      "Some rectangle can be tiled by copies (rotations and reflections allowed).",
    numeric: false,
  },
  {
    key: "order",
    label: "Order",
    description: "The fewest copies that tile a rectangle.",
    numeric: true,
  },
  {
    key: "oddOrder",
    label: "Odd order",
    description: "The fewest copies, odd in number, that tile a rectangle.",
    numeric: true,
  },
  {
    key: "smallestRectangles",
    label: "Smallest rectangles",
    description: "The tileable rectangles of least area.",
    numeric: false,
  },
  {
    key: "smallestSquare",
    label: "Smallest square",
    description: "Side of the smallest tileable square.",
    numeric: true,
  },
  {
    key: "primeRectangles",
    label: "Prime rectangles",
    description:
      "Tileable rectangles that cannot be cut into two smaller tileable rectangles.",
    numeric: false,
  },
  {
    key: "tilesHalfStrip",
    label: "Tiles a half-strip",
    description:
      "Copies tile a half-strip: the region between two parallel walls, closed at one end and infinite in the other direction.",
    numeric: false,
  },
  {
    key: "tilesPlane",
    label: "Tiles the plane",
    description: "Copies tile the whole plane.",
    numeric: false,
  },
  {
    key: "minColors",
    label: "Fewest colors",
    description:
      "Over all rectangle tilings, the fewest colors needed so that copies sharing an edge differ.",
    numeric: true,
  },
];

/** Properties about rectangle tilings, meaningless for a piece that tiles no rectangle. */
export const RECTANGLE_PROPERTY_KEYS: ReadonlySet<PropertyKey> = new Set([
  "order",
  "oddOrder",
  "smallestRectangles",
  "smallestSquare",
  "primeRectangles",
  "minColors",
]);

/** True when the property cannot have a value because the piece tiles no rectangle. */
export function isNotApplicable(
  key: PropertyKey,
  properties: Properties,
): boolean {
  return (
    RECTANGLE_PROPERTY_KEYS.has(key) && properties.rectifiable?.value === false
  );
}

/**
 * Properties the site shows. Every listed piece tiles a rectangle or is open, and every
 * rectangle tiler tiles the plane, so "tiles the plane" says nothing here.
 */
export const SHOWN_PROPERTY_DEFINITIONS: readonly PropertyDefinition[] =
  PROPERTY_DEFINITIONS.filter((definition) => definition.key !== "tilesPlane");

/** data/sizes.json: every size up to `complete` was classified in full. */
export interface SizeTotals {
  readonly complete: number;
  readonly note: string;
  readonly sizes: Readonly<
    Record<string, { readonly total: number; readonly withHoles: number }>
  >;
}

export const PROPERTY_KEYS: readonly PropertyKey[] = PROPERTY_DEFINITIONS.map(
  (definition) => definition.key,
);
