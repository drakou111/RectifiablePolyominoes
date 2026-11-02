import { MAX_GENERATED_SIZE, type CatalogItem } from "../../core/catalog";
import { PROPERTY_DEFINITIONS, type ReferenceKind } from "../../core/model";
import { polyominoHref, type SiteContext } from "../context";
import { h, link } from "../dom";
import { citationLink, formatProperty, fullCitation } from "../format";
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
  const entered = items.filter((item) => item.entry !== undefined).length;
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
        `: ${items.length} polyominoes (all up to ${MAX_GENERATED_SIZE} cells), ${entered} with entered data, ${tilings} recorded tilings.`,
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
      "Everything on this site is plain JSON. The button below exports every polyomino (with shape, derived and entered properties), every tiling and every reference as one file. The raw files are also served individually under ",
      h("code", {}, "data/"),
      ", e.g. ",
      link("data/references.json", h("code", {}, "data/references.json")),
      ".",
    ),
    allDataDownloadButton(context),
  );
}

export function openProblemsPage(context: SiteContext): HTMLElement {
  const items = itemsWithOpenProperties(context);
  const rows = items.map((item) => {
    const openProperties = PROPERTY_DEFINITIONS.filter(
      (definition) => item.properties[definition.key]?.status === "open",
    );
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
      h("td", {}, link(polyominoHref(item.id), h("code", {}, item.id))),
      h("td", { class: "numeric" }, item.size),
      h(
        "td",
        {},
        ...openProperties.map((definition) => {
          const record = item.properties[definition.key];
          return h(
            "div",
            {},
            `${definition.label}: ${record === undefined ? "" : formatProperty(definition.key, record)}`,
            record?.ref &&
              h(
                "span",
                {},
                " (",
                citationLink(
                  record.ref,
                  context.references.get(record.ref),
                  record.refDetail,
                ),
                ")",
              ),
          );
        }),
      ),
    );
  });
  return h(
    "section",
    {},
    h("h1", {}, "Open problems"),
    h(
      "p",
      {},
      "Polyominoes with at least one property recorded as open. Bounds, where known, are shown.",
    ),
    items.length === 0
      ? h("p", {}, "None recorded.")
      : h(
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
              h("th", {}, "Open"),
            ),
          ),
          h("tbody", {}, ...rows),
        ),
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
