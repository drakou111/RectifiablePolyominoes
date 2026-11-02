import type { CatalogItem, TilingRef } from "./catalog";
import type { PropertyKey } from "./model";

/** One picture a property calls for: a stored tiling, or a gap where none is stored yet. */
export interface TilingSlot {
  readonly caption: string;
  readonly ref?: TilingRef;
  /** Set when an earlier group already shows this tiling: drawn small, pointing back. */
  readonly repeatOf?: {
    readonly key: TilingGroup["key"];
    readonly title: string;
  };
}

export interface TilingGroup {
  readonly key: PropertyKey | "other";
  readonly title: string;
  readonly description: string;
  readonly slots: readonly TilingSlot[];
  /** Many small pictures (prime rectangles) rather than a few large ones. */
  readonly compact: boolean;
  /** Draw with the fewest-colors coloring whatever the page setting is. */
  readonly forceFewestColors: boolean;
}

const sameSize = (ref: TilingRef, width: number, height: number): boolean =>
  (ref.width === width && ref.height === height) ||
  (ref.width === height && ref.height === width);

const rectangleText = (width: number, height: number): string =>
  `${Math.min(width, height)} x ${Math.max(width, height)}`;

const copiesText = (count: number): string =>
  count === 1 ? "1 copy" : `${count} copies`;

/** Matches the "stored 24x23 tiling" wording that bound notes use. */
const STORED_TILING_NOTE = /stored (\d+)x(\d+) tiling/;

/**
 * Sorts a piece's stored tilings under the properties they witness, in table order, so each
 * property gets a picture. Properties with nothing to picture are left out; tilings that match
 * no property land in a final "other" group.
 */
export function groupTilings(item: CatalogItem): TilingGroup[] {
  const { properties, tilings, size } = item;
  if (item.polyomino.isRectangle()) return [];
  const used = new Set<TilingRef>();
  const find = (test: (ref: TilingRef) => boolean): TilingRef | undefined => {
    const ref = tilings.find(test);
    if (ref !== undefined) used.add(ref);
    return ref;
  };
  const groups: TilingGroup[] = [];
  const firstShown = new Map<TilingRef, NonNullable<TilingSlot["repeatOf"]>>();
  const add = (
    group: Omit<TilingGroup, "compact" | "forceFewestColors"> &
      Partial<Pick<TilingGroup, "compact" | "forceFewestColors">>,
  ): void => {
    const slots = group.slots.map((slot): TilingSlot => {
      if (slot.ref === undefined) return slot;
      const earlier = firstShown.get(slot.ref);
      if (earlier !== undefined) return { ...slot, repeatOf: earlier };
      firstShown.set(slot.ref, { key: group.key, title: group.title });
      return slot;
    });
    groups.push({ compact: false, forceFewestColors: false, ...group, slots });
  };

  const order = properties.order?.value;
  const smallest = properties.smallestRectangles?.value;
  if (smallest !== undefined && smallest.length > 0)
    add({
      key: "smallestRectangles",
      title:
        smallest.length === 1 ? "Smallest rectangle" : "Smallest rectangles",
      description:
        order === undefined
          ? "The rectangles of least area that copies tile."
          : `The order is ${order}: no rectangle is tiled by fewer copies.`,
      slots: smallest.map(([width, height]) => ({
        caption: `${rectangleText(width, height)}, ${copiesText((width * height) / size)}`,
        ref: find((ref) => sameSize(ref, width, height)),
      })),
    });

  const square = properties.smallestSquare?.value;
  if (typeof square === "number")
    add({
      key: "smallestSquare",
      title: "Smallest square",
      description: `No smaller square is tiled.`,
      slots: [
        {
          caption: `${square} x ${square}, ${copiesText((square * square) / size)}`,
          ref: find((ref) => sameSize(ref, square, square)),
        },
      ],
    });

  const odd = properties.oddOrder?.value;
  if (typeof odd === "number")
    add({
      key: "oddOrder",
      title: "Smallest odd tiling",
      description: `No rectangle is tiled by an odd number of copies below ${odd}.`,
      slots: [
        {
          caption: copiesText(odd),
          ref:
            find((ref) => ref.label === "odd") ??
            find((ref) => ref.width * ref.height === odd * size),
        },
      ],
    });

  const colors = properties.minColors;
  const colorCount = colors?.value ?? colors?.upper;
  if (colors !== undefined && colorCount !== undefined) {
    const noted = STORED_TILING_NOTE.exec(colors.note ?? colors.reason ?? "");
    const ref =
      find((ref) => ref.label === `${colorCount}colors`) ??
      (noted === null
        ? undefined
        : find((ref) => sameSize(ref, Number(noted[1]), Number(noted[2]))));
    add({
      key: "minColors",
      title: "Fewest colors",
      description:
        colors.value === undefined
          ? `The best known tiling needs ${colorCount} colors; whether fewer suffice is open.`
          : `${colorCount} colors suffice for some rectangle tiling, and no tiling needs fewer.`,
      slots: [{ caption: `${colorCount} colors`, ref }],
      forceFewestColors: true,
    });
  }

  const primes = properties.primeRectangles?.value;
  if (primes !== undefined && primes.rectangles.length > 0)
    add({
      key: "primeRectangles",
      title: "Prime rectangles",
      description: `Tileable rectangles that cannot be cut into two tileable rectangles${primes.complete ? "" : " (the list may be incomplete)"}.`,
      slots: primes.rectangles.map(([width, height]) => ({
        caption: `${rectangleText(width, height)}, ${copiesText((width * height) / size)}`,
        ref: find((ref) => sameSize(ref, width, height)),
      })),
      compact: true,
    });

  const other = tilings.filter((ref) => !used.has(ref));
  if (other.length > 0)
    add({
      key: "other",
      title: "Other tilings",
      description: "Stored tilings not tied to a property above.",
      slots: other.map((ref) => ({
        caption: `${rectangleText(ref.width, ref.height)}, ${copiesText((ref.width * ref.height) / size)}`,
        ref,
      })),
    });
  return groups;
}
