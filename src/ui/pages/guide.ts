import { polyominoHref, type SiteContext } from "../context";
import { h, link } from "../dom";
import { referenceHref } from "../format";

export interface GuideTopic {
  readonly slug: string;
  readonly title: string;
  /** One line for the guide's index. */
  readonly summary: string;
}

/** Display order of the guide. Each slug has a file src/guide/<slug>.html. */
export const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    slug: "notation",
    title: "Notation and IDs",
    summary: "How shapes are named, and how tilings are stored.",
  },
  {
    slug: "order",
    title: "Order, odd order and smallest rectangles",
    summary:
      "The fewest copies that tile a rectangle, with and without an odd count.",
  },
  {
    slug: "impossibility",
    title: "Proving that no rectangle exists",
    summary:
      "Coloring, corner and wall arguments that rule out every rectangle.",
  },
  {
    slug: "prime-rectangles",
    title: "Prime rectangles",
    summary: "The rectangles every tileable rectangle is glued from.",
  },
  {
    slug: "plane",
    title: "Half-strips and the plane",
    summary:
      "Where the rectangle question gets hard: pieces that tile strips or the plane but maybe no rectangle.",
  },
  {
    slug: "colors",
    title: "Fewest colors",
    summary:
      "How many colors a rectangle tiling needs so that neighbours differ.",
  },
  {
    slug: "computations",
    title: "Computed results",
    summary:
      "What this site's search tools compute, and how the results are checked.",
  },
  {
    slug: "history",
    title: "History",
    summary: "A timeline of the sources cited here, from 1965 on.",
  },
  {
    slug: "data-format",
    title: "Data format and contributing",
    summary: "The JSON files behind the site, and how to add to them.",
  },
];

const pages: Record<string, string> = import.meta.glob("../../guide/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

function topicHtml(slug: string): string | undefined {
  return pages[`../../guide/${slug}.html`];
}

/**
 * Fills placeholders in the trusted guide fragments:
 * <a data-ref="key"></a> becomes the year (or title) linked to the reference, <a data-poly="id"></a> a link to that polyomino.
 */
function fillPlaceholders(root: HTMLElement, context: SiteContext): void {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
    "a[data-ref]",
  )) {
    const key = anchor.dataset.ref ?? "";
    const reference = context.references.get(key);
    if (reference === undefined)
      throw new Error(`Guide cites unknown reference "${key}"`);
    anchor.href = referenceHref(key);
    // The guide text names the authors itself, so the link only adds the year.
    if (anchor.textContent === "")
      anchor.textContent = String(reference.year ?? reference.title);
  }
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
    "a[data-poly]",
  )) {
    const id = anchor.dataset.poly ?? "";
    anchor.href = polyominoHref(id);
    if (anchor.textContent === "") anchor.append(h("code", {}, id));
  }
}

export function guidePage(
  context: SiteContext,
  slug: string | undefined,
): HTMLElement {
  const nav = h(
    "ol",
    { class: "guide-nav" },
    ...GUIDE_TOPICS.map((topic) =>
      h("li", {}, link(`#/guide/${topic.slug}`, topic.title)),
    ),
  );
  if (slug === undefined)
    return h(
      "section",
      {},
      h("h1", {}, "Guide"),
      h(
        "dl",
        { class: "guide-index" },
        ...GUIDE_TOPICS.flatMap((topic) => [
          h("dt", {}, link(`#/guide/${topic.slug}`, topic.title)),
          h("dd", {}, topic.summary),
        ]),
      ),
    );

  const topic = GUIDE_TOPICS.find((candidate) => candidate.slug === slug);
  const html = topicHtml(slug);
  if (topic === undefined || html === undefined)
    return h("section", {}, h("h1", {}, "No such guide page"), nav);

  const article = h("article", { class: "guide" });
  article.innerHTML = html;
  fillPlaceholders(article, context);
  const index = GUIDE_TOPICS.indexOf(topic);
  const next = GUIDE_TOPICS[index + 1];
  return h(
    "section",
    {},
    h(
      "p",
      { class: "muted" },
      link("#/guide", "Guide"),
      ` / ${index + 1} of ${GUIDE_TOPICS.length}`,
    ),
    h("h1", {}, topic.title),
    article,
    next && h("p", {}, "Next: ", link(`#/guide/${next.slug}`, next.title)),
  );
}
