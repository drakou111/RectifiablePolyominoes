import type { CatalogItem } from "../../core/catalog";
import type { PropertyKey } from "../../core/model";
import { catalogueSizes, summarizeSize } from "../../core/size-summary";
import { polyominoHref, type SiteContext } from "../context";
import { h, link } from "../dom";
import { renderPolyomino } from "../render";
import { propertyCell, sizeName } from "./browse";

const COLUMNS: readonly {
  readonly key: PropertyKey;
  readonly label: string;
}[] = [
  { key: "rectifiable", label: "Tiles a rectangle" },
  { key: "order", label: "Order" },
  { key: "smallestRectangles", label: "Smallest rectangles" },
  { key: "oddOrder", label: "Odd order" },
  { key: "smallestSquare", label: "Smallest square" },
  { key: "minColors", label: "Fewest colors" },
];

/** One size's numbers; `total` and `tileNone` are known only for fully classified sizes. */
interface SizeCounts {
  readonly total?: number;
  readonly tilers: number;
  readonly open: number;
  readonly tileNone?: number;
}

function sizeCounts(context: SiteContext, size: number): SizeCounts {
  // Counted by the rectangle question; the size page lists open orders separately.
  const pieces = context.catalog.items.filter((item) => item.size === size);
  const tilers = pieces.filter(
    (item) => item.properties.rectifiable?.value === true,
  ).length;
  const open = pieces.length - tilers;
  const total =
    size <= context.sizeTotals.complete
      ? context.sizeTotals.sizes[String(size)]?.total
      : undefined;
  if (total === undefined) return { tilers, open };
  return { total, tilers, open, tileNone: total - tilers - open };
}

/** All sizes that are classified in full, then the larger ones with selected pieces. */
function shownSizes(context: SiteContext): number[] {
  const complete = Array.from(
    { length: context.sizeTotals.complete },
    (_, i) => i + 1,
  );
  return [
    ...new Set([...complete, ...catalogueSizes(context.catalog.items)]),
  ].sort((a, b) => a - b);
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Every size with its counts: which sizes are classified in full, and what the catalogue keeps. */
export function sizesPage(context: SiteContext): HTMLElement {
  const rows = shownSizes(context).map((size) => {
    const counts = sizeCounts(context, size);
    const complete = counts.total !== undefined;
    const muted = (text: string): HTMLElement =>
      h("span", { class: "muted" }, text);
    return h(
      "tr",
      {},
      h("td", {}, link(`#/size/${size}`, sizeName(size))),
      h("td", { class: "numeric" }, size),
      h(
        "td",
        { class: "numeric" },
        complete ? counts.total : muted("not classified"),
      ),
      h("td", { class: "numeric" }, counts.tilers),
      h(
        "td",
        { class: counts.open > 0 ? "numeric status-open" : "numeric" },
        counts.open,
      ),
      h(
        "td",
        { class: "numeric" },
        counts.tileNone === undefined ? muted("-") : counts.tileNone,
      ),
    );
  });
  return h(
    "section",
    {},
    h("h1", {}, "Sizes"),
    h(
      "p",
      {},
      `Every free polyomino with up to ${context.sizeTotals.complete} cells has been classified. `,
      "The catalogue keeps the ones that tile a rectangle and the ones still open; every other one was shown to tile no rectangle. ",
      "Larger sizes hold only selected pieces with published or computed results.",
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
            h("th", {}, "Size"),
            h("th", { class: "numeric" }, "Cells"),
            h("th", { class: "numeric" }, "Free polyominoes"),
            h("th", { class: "numeric" }, "Tile a rectangle"),
            h("th", { class: "numeric" }, "Open"),
            h("th", { class: "numeric" }, "Tile none (not listed)"),
          ),
        ),
        h("tbody", {}, ...rows),
      ),
    ),
  );
}

function piecesTable(items: readonly CatalogItem[]): HTMLElement {
  return h(
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
          ...COLUMNS.map((column) => h("th", {}, column.label)),
          h("th", { class: "numeric" }, "Tilings"),
        ),
      ),
      h(
        "tbody",
        {},
        ...items.map((item) =>
          h(
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
              item.entry?.names?.length
                ? h("div", { class: "muted" }, item.entry.names.join(", "))
                : null,
            ),
            ...COLUMNS.map((column) => propertyCell(item, column.key)),
            h("td", { class: "numeric" }, item.tilings.length || ""),
          ),
        ),
      ),
    ),
  );
}

/** One size: unknown orders first, then every rectangle tiler by order, highest first. */
export function sizePage(context: SiteContext, argument: string): HTMLElement {
  const size = Number(argument);
  const sizes = shownSizes(context);
  if (!Number.isInteger(size) || !sizes.includes(size))
    return h(
      "section",
      {},
      h("h1", {}, "No such size"),
      h("p", {}, "See ", link("#/sizes", "all sizes"), "."),
    );
  const summary = summarizeSize(context.catalog.items, size);
  const counts = sizeCounts(context, size);
  const index = sizes.indexOf(size);
  const neighbour = (offset: number, text: string) => {
    const other = sizes[index + offset];
    return other === undefined
      ? ""
      : link(`#/size/${other}`, `${text} ${sizeName(other)}`);
  };

  return h(
    "section",
    {},
    h("h1", {}, sizeName(size)),
    h(
      "p",
      { class: "muted" },
      neighbour(-1, "Previous:"),
      index > 0 && index < sizes.length - 1 ? " | " : "",
      neighbour(1, "Next:"),
      " | ",
      link("#/sizes", "All sizes"),
    ),
    h(
      "p",
      {},
      counts.total === undefined
        ? `Selected polyominoes with ${size} cells: ${plural(counts.tilers, "tiles", "tile")} a rectangle${counts.open > 0 ? `, ${counts.open} open` : ""}. This size is not classified in full.`
        : `Of the ${counts.total} free polyominoes with ${size} cells, ${plural(counts.tilers, "tiles", "tile")} a rectangle, ${counts.open} ${counts.open === 1 ? "is" : "are"} open, and the other ${counts.tileNone} tile no rectangle (not listed).`,
    ),
    summary.unknown.length > 0 &&
      h(
        "section",
        {},
        h("h2", {}, "Order unknown"),
        piecesTable(summary.unknown),
      ),
    summary.tilers.length > 0 &&
      h(
        "section",
        {},
        h("h2", {}, "Tile a rectangle, by order"),
        piecesTable(summary.tilers),
      ),
  );
}
