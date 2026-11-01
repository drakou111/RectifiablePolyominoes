import { polyominoHref, type SiteContext } from "../context";
import { h, link } from "../dom";
import { referenceHref } from "../format";

export interface GuideTopic {
  readonly slug: string;
  readonly title: string;
}

/** Display order of the guide. Each slug has a file src/guide/<slug>.html. */
export const GUIDE_TOPICS: readonly GuideTopic[] = [
  { slug: "notation", title: "Notation and IDs" },
  { slug: "order", title: "Order, odd order and smallest rectangles" },
  { slug: "impossibility", title: "Proving that no rectangle exists" },
  { slug: "prime-rectangles", title: "Prime rectangles" },
  { slug: "plane", title: "Tiling the plane" },
  { slug: "colors", title: "Fewest colors" },
  { slug: "history", title: "History" },
  { slug: "data-format", title: "Data format and contributing" },
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
  if (slug === undefined) return h("section", {}, h("h1", {}, "Guide"), nav);

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
