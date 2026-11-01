import type {
  PrimeRectangles,
  PropertyKey,
  PropertyRecord,
  PropertyValues,
  RectangleSize,
  Reference,
} from "../core/model";
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
