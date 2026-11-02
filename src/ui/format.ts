import type {
  PrimeRectangles,
  PropertyKey,
  PropertyRecord,
  PropertyValues,
  RectangleSize,
  Reference,
} from "../core/model";
import type { CatalogItem } from "../core/catalog";
import { h, link, type Child } from "./dom";

const formatRectangle = ([width, height]: RectangleSize): string =>
  `${width}x${height}`;

export function formatValue(key: PropertyKey, value: unknown): string {
  switch (key) {
    case "rectifiable":
    case "tilesHalfStrip":
    case "tilesPlane":
      return value ? "yes" : "no";
    case "smallestRectangles":
      return (value as PropertyValues["smallestRectangles"])
        .map(formatRectangle)
        .join(", ");
    case "primeRectangles": {
      const prime = value as PrimeRectangles;
      return `${prime.rectangles.map(formatRectangle).join(", ")} (${prime.complete ? "complete list" : "list may be incomplete"})`;
    }
    default:
      return String(value);
  }
}

/**
 * Like formatProperty, but a prime-rectangle list becomes its length: the full list can run to
 * hundreds of rectangles and belongs in the tilings section.
 */
export function summarizeProperty(
  key: PropertyKey,
  record: PropertyRecord<unknown>,
): string {
  if (key !== "primeRectangles" || record.value === undefined)
    return formatProperty(key, record);
  const prime = record.value as PrimeRectangles;
  const count = prime.rectangles.length;
  return `${count} ${count === 1 ? "rectangle" : "rectangles"} (${prime.complete ? "complete list" : "list may be incomplete"})`;
}

/** Value, or bounds while open: "open", "open, at least 76", "open, between 3 and 4". */
export function formatProperty(
  key: PropertyKey,
  record: PropertyRecord<unknown>,
): string {
  if (record.value !== undefined) return formatValue(key, record.value);
  const { lower, upper } = record;
  if (lower !== undefined && upper !== undefined)
    return `open, between ${lower} and ${upper}`;
  if (lower !== undefined) return `open, at least ${lower}`;
  if (upper !== undefined) return `open, at most ${upper}`;
  return "open";
}

export function referenceHref(key: string): string {
  return `#/references?ref=${encodeURIComponent(key)}`;
}

export function shortCitation(
  key: string,
  reference: Reference | undefined,
): string {
  if (reference === undefined) return key;
  if (reference.kind === "website")
    return `${reference.authors.join(", ")}, ${reference.title}`;
  const firstAuthor = reference.authors[0]?.split(" ").at(-1) ?? "";
  const authors =
    reference.authors.length > 2
      ? `${firstAuthor} et al.`
      : reference.authors.map((a) => a.split(" ").at(-1)).join(" and ");
  return reference.year === undefined
    ? `${authors}, ${reference.title}`
    : `${authors} (${reference.year})`;
}

export function citationLink(
  key: string,
  reference: Reference | undefined,
  detail?: string,
): HTMLElement {
  return h(
    "span",
    { class: "citation" },
    link(referenceHref(key), shortCitation(key, reference)),
    detail && `, ${detail}`,
  );
}

/** Full bibliographic entry. */
export function fullCitation(reference: Reference): Child[] {
  const parts = [
    reference.venue,
    reference.volume,
    reference.pages && `pp. ${reference.pages}`,
  ].filter(Boolean);
  const target =
    reference.doi === undefined
      ? reference.url
      : `https://doi.org/${reference.doi}`;
  return [
    `${reference.authors.join(", ")}${reference.year === undefined ? "" : ` (${reference.year})`}. `,
    target === undefined
      ? h("em", {}, reference.title)
      : link(target, h("em", {}, reference.title)),
    parts.length > 0 ? `. ${parts.join(", ")}.` : ".",
    !reference.checked &&
      h(
        "span",
        {
          class: "badge unchecked",
          title: "Details not yet checked against the source",
        },
        "unchecked",
      ),
  ];
}

/** Class that colors yes/no answers, or undefined for other values. */
export function answerClass(value: unknown): string | undefined {
  if (value === true) return "answer-yes";
  if (value === false) return "answer-no";
  return undefined;
}

export function statusBadge(status: string): HTMLElement {
  return h("span", { class: `badge status-${status}` }, status);
}

/** The answer most readers want first: does it tile a rectangle, and how small. */
export function leadSummary(item: CatalogItem): string {
  const { rectifiable, order, smallestRectangles } = item.properties;
  if (item.polyomino.isRectangle()) return "The piece is itself a rectangle.";
  if (rectifiable?.value === false) return "Copies tile no rectangle.";
  if (rectifiable?.status === "open" || rectifiable === undefined)
    return order?.lower !== undefined
      ? `Not known whether copies tile any rectangle; a rectangle would need at least ${order.lower} copies.`
      : "Not known whether copies tile any rectangle.";
  const sizes = smallestRectangles?.value ?? [];
  const sizeText = sizes
    .map(([a, b]) => `${Math.min(a, b)} x ${Math.max(a, b)}`)
    .join(", ");
  if (order?.value === undefined) return "Copies tile a rectangle.";
  return sizes.length === 0
    ? `Order ${order.value}: no rectangle is tiled by fewer copies.`
    : `Order ${order.value}: the smallest ${sizes.length === 1 ? "rectangle is" : "rectangles are"} ${sizeText}.`;
}
