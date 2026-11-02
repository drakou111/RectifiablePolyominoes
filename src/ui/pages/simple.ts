import { MAX_GENERATED_SIZE, type CatalogItem } from "../../core/catalog";
import {
  PROPERTY_DEFINITIONS,
  type PropertyKey,
  type ReferenceKind,
} from "../../core/model";
import { polyominoHref, type SiteContext } from "../context";
import { h, link } from "../dom";
import { citationLink, fullCitation, summarizeProperty } from "../format";
import { renderPolyomino } from "../render";
import { allDataDownloadButton } from "../download";
import { GUIDE_TOPICS } from "./guide";

const MAX_LISTED_CITATIONS = 30;

/** Pieces with at least one open property: the rows of the open problems page. */
function itemsWithOpenProperties(context: SiteContext): CatalogItem[] {
  return context.catalog.items.filter((item) =>
    PROPERTY_DEFINITIONS.some(
      (definition) => item.properties[definition.key]?.status === "open",
    ),
  );
}

export function homePage(context: SiteContext): HTMLElement {
  const { items } = context.catalog;
  const complete = items.filter(
    (item) => item.size <= MAX_GENERATED_SIZE,
  ).length;
  const open = itemsWithOpenProperties(context).length;
  const rectangleOpen = items.filter(
    (item) => item.properties.rectifiable?.status === "open",
  ).length;
  const tilings = items.reduce((count, item) => count + item.tilings.length, 0);
  return h(
    "section",
    {},
    h("h1", {}, "Rectifiable Polyominoes"),
    h("p", { class: "subtitle" }, "Polyominoes that tile rectangles"),
    h(
      "p",
      {},
      "This is a catalogue of what is known about tiling rectangles with copies of a single polyomino, rotations and reflections allowed. ",
      "For each polyomino it records whether some rectangle can be tiled, its order and odd order, the smallest rectangles and squares, ",
      "the prime rectangles, whether it tiles the plane, and the fewest colors a rectangle tiling needs. ",
      "Every settled result links to its first publication, and recorded tilings can be viewed and downloaded.",
    ),
    h(
      "ul",
      {},
      h(
        "li",
        {},
        link("#/browse", "Catalogue"),
        `: all ${complete} polyominoes with up to ${MAX_GENERATED_SIZE} cells, ${items.length - complete} selected larger ones, and ${tilings} recorded tilings.`,
      ),
      h(
        "li",
        {},
        link("#/sizes", "Sizes"),
        `: a page for each size, listing the pieces by order (complete up to ${MAX_GENERATED_SIZE} cells).`,
      ),
      h(
        "li",
        {},
        link("#/open", "Open problems"),
        `: ${open} polyominoes with open questions, ${rectangleOpen} of them on whether any rectangle can be tiled.`,
      ),
      h(
        "li",
        {},
        link("#/guide", "Guide"),
        ": definitions, notation, proof techniques and history.",
      ),
      h(
        "li",
        {},
        link("#/references", "References"),
        `: ${context.references.size} sources.`,
      ),
    ),
    h("h2", {}, "Data"),
    h(
      "p",
      {},
      "Everything here is plain JSON, served under ",
      h("code", {}, "data/"),
      " (for example ",
      link("data/references.json", h("code", {}, "data/references.json")),
      "), or as one file: ",
      allDataDownloadButton(context),
    ),
  );
}

/** Each open property as the question it leaves open. */
const OPEN_QUESTIONS: Record<PropertyKey, string> = {
  rectifiable: "Does it tile any rectangle?",
  order: "What is its order?",
  oddOrder: "What is its odd order?",
  smallestRectangles: "What are its smallest rectangles?",
  smallestSquare: "What is its smallest square?",
  primeRectangles: "Is the list of prime rectangles complete?",
  tilesHalfStrip: "Does it tile a half-strip?",
  tilesPlane: "Does it tile the plane?",
  minColors: "How few colors does a rectangle tiling need?",
};

/** One section per open question; `?type=<property>` shows just that one. */
export function openProblemsPage(
  context: SiteContext,
  params: URLSearchParams,
): HTMLElement {
  const groups = PROPERTY_DEFINITIONS.map((definition) => ({
    definition,
    items: context.catalog.items.filter(
      (item) => item.properties[definition.key]?.status === "open",
    ),
  })).filter((group) => group.items.length > 0);
  const wanted = params.get("type");
  const shown = groups.filter(
    (group) => wanted === null || group.definition.key === wanted,
  );

  const typeLink = (key: string | null, text: string): HTMLElement =>
    key === wanted
      ? h("strong", {}, text)
      : link(key === null ? "#/open" : `#/open?type=${key}`, text);
  const nav = h(
    "p",
    { class: "open-nav" },
    typeLink(
      null,
      `All (${itemsWithOpenProperties(context).length} polyominoes)`,
    ),
    ...groups.flatMap((group) => [
      " | ",
      typeLink(
        group.definition.key,
        `${group.definition.label} (${group.items.length})`,
      ),
    ]),
  );

  const section = ({
    definition,
    items,
  }: (typeof groups)[number]): HTMLElement =>
    h(
      "section",
      { id: `open-${definition.key}` },
      h("h2", {}, OPEN_QUESTIONS[definition.key]),
      h(
        "p",
        { class: "muted" },
        `${definition.label}: ${definition.description} `,
        `${items.length} ${items.length === 1 ? "polyomino" : "polyominoes"}.`,
      ),
      h(
        "div",
        { class: "table-scroll" },
        h(
          "table",
          { class: "catalogue" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", {}, "Shape"),
              h("th", {}, "ID"),
              h("th", { class: "numeric" }, "Cells"),
              h("th", {}, "What is known"),
              h("th", {}, "Source and notes"),
            ),
          ),
          h(
            "tbody",
            {},
            ...items.map((item) => {
              const record = item.properties[definition.key];
              return h(
                "tr",
                {},
                h(
                  "td",
                  { class: "thumb" },
                  link(
                    polyominoHref(item.id),
                    renderPolyomino(item.polyomino, "shape thumbnail"),
                  ),
                ),
                h(
                  "td",
                  {},
                  link(polyominoHref(item.id), h("code", {}, item.id)),
                ),
                h("td", { class: "numeric" }, item.size),
                h(
                  "td",
                  {},
                  record === undefined
                    ? ""
                    : summarizeProperty(definition.key, record),
                ),
                h(
                  "td",
                  {},
                  record?.ref &&
                    citationLink(
                      record.ref,
                      context.references.get(record.ref),
                      record.refDetail,
                    ),
                  record?.note && h("div", { class: "muted" }, record.note),
                ),
              );
            }),
          ),
        ),
      ),
    );

  return h(
    "section",
    {},
    h("h1", {}, "Open problems"),
    h(
      "p",
      {},
      "Questions this catalogue records as open, grouped by kind. Bounds are shown where known. ",
      "Pick a kind to see only those polyominoes.",
    ),
    nav,
    shown.length === 0
      ? h("p", {}, "None recorded.")
      : h("div", {}, ...shown.map(section)),
  );
}

export function referencesPage(
  context: SiteContext,
  params: URLSearchParams,
): HTMLElement {
  const citedBy = new Map<string, string[]>();
  const untracedCounts = new Map<string, number>();
  const cite = (ref: string, id: string): void => {
    const list = citedBy.get(ref) ?? [];
    if (!list.includes(id)) list.push(id);
    citedBy.set(ref, list);
  };
  for (const item of context.catalog.items) {
    for (const record of Object.values(item.properties)) {
      if (record?.ref === undefined) continue;
      cite(record.ref, item.id);
      if (record.untraced)
        untracedCounts.set(
          record.ref,
          (untracedCounts.get(record.ref) ?? 0) + 1,
        );
    }
    for (const ref of item.entry?.seeAlso ?? []) cite(ref, item.id);
  }
  const highlighted = params.get("ref");
  const sorted = [...context.references].sort(
    ([, a], [, b]) =>
      (a.year ?? Infinity) - (b.year ?? Infinity) ||
      a.title.localeCompare(b.title),
  );
  const listOf = (kind: ReferenceKind): HTMLOListElement =>
    h(
      "ol",
      { class: "references" },
      ...sorted
        .filter(([, reference]) => reference.kind === kind)
        .map(([key, reference]) =>
          h(
            "li",
            {
              id: `ref-${key}`,
              class: key === highlighted ? "highlight" : undefined,
            },
            ...fullCitation(reference),
            citedBy.has(key) &&
              h(
                "div",
                { class: "muted" },
                `Cited for ${citedBy.get(key)?.length ?? 0} polyominoes: `,
                ...(citedBy.get(key) ?? [])
                  .slice(0, MAX_LISTED_CITATIONS)
                  .flatMap((id, i) => [
                    i > 0 ? ", " : "",
                    link(polyominoHref(id), id),
                  ]),
                (citedBy.get(key)?.length ?? 0) > MAX_LISTED_CITATIONS &&
                  ", ...",
                untracedCounts.has(key) &&
                  h(
                    "div",
                    {},
                    `${untracedCounts.get(key)} results citing this as their data source still need their first publication traced.`,
                  ),
              ),
          ),
        ),
    );
  const list = h(
    "div",
    {},
    h("h2", {}, "Papers, books and manuscripts"),
    listOf("publication"),
    h("h2", {}, "Websites, databases and software"),
    listOf("website"),
  );
  if (highlighted !== null)
    requestAnimationFrame(() =>
      document
        .getElementById(`ref-${highlighted}`)
        ?.scrollIntoView({ block: "center" }),
    );
  return h(
    "section",
    {},
    h("h1", {}, "References"),
    h(
      "p",
      {},
      "Entries marked unchecked have not yet been verified against the source.",
    ),
    list,
    h(
      "p",
      {},
      "Guide pages: ",
      ...GUIDE_TOPICS.flatMap((topic, i) => [
        i > 0 ? ", " : "",
        link(`#/guide/${topic.slug}`, topic.title),
      ]),
    ),
  );
}
