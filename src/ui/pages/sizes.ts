import { MAX_GENERATED_SIZE, type CatalogItem } from "../../core/catalog";
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

const isComplete = (size: number): boolean => size <= MAX_GENERATED_SIZE;

/** Every size with its counts: which sizes are enumerated in full, and how they sort out. */
export function sizesPage(context: SiteContext): HTMLElement {
  const { items } = context.catalog;
  const rows = catalogueSizes(items).map((size) => {
    const summary = summarizeSize(items, size);
    const total =
      summary.unknown.length + summary.tilers.length + summary.nonTilers;
    return h(
      "tr",
      {},
      h("td", {}, link(`#/size/${size}`, sizeName(size))),
      h("td", { class: "numeric" }, size),
      h(
        "td",
        {},
        isComplete(size)
          ? "all"
          : h("span", { class: "muted" }, "selected only"),
      ),
      h("td", { class: "numeric" }, total),
      h("td", { class: "numeric" }, summary.tilers.length),
      h("td", { class: "numeric" }, summary.nonTilers),
      h(
        "td",
        {
          class: summary.unknown.length > 0 ? "numeric status-open" : "numeric",
        },
        summary.unknown.length,
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
      `Every free polyomino with up to ${MAX_GENERATED_SIZE} cells is in the catalogue and has been classified. `,
      "Larger sizes hold only selected pieces with published or computed results, so their counts say nothing about all polyominoes of that size.",
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
            h("th", {}, "Included"),
            h("th", { class: "numeric" }, "Pieces"),
            h("th", { class: "numeric" }, "Tile a rectangle"),
            h("th", { class: "numeric" }, "Tile none"),
            h("th", { class: "numeric" }, "Unknown"),
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
  const sizes = catalogueSizes(context.catalog.items);
  if (!Number.isInteger(size) || !sizes.includes(size))
    return h(
      "section",
      {},
      h("h1", {}, "No such size"),
      h("p", {}, "See ", link("#/sizes", "all sizes"), "."),
    );
  const summary = summarizeSize(context.catalog.items, size);
  const total =
    summary.unknown.length + summary.tilers.length + summary.nonTilers;
  const index = sizes.indexOf(size);
  const neighbour = (offset: number, text: string) => {
    const other = sizes[index + offset];
    return other === undefined
      ? ""
      : link(`#/size/${other}`, `${text} ${sizeName(other)}`);
  };
  const noun = (count: number): string =>
    `${count} ${count === 1 ? "piece" : "pieces"}`;

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
      isComplete(size)
        ? `All ${total} free polyominoes with ${size} cells. `
        : `${total} selected polyominoes with ${size} cells; this size is not enumerated in full. `,
      `${summary.tilers.length} tile a rectangle, `,
      summary.nonTilers > 0
        ? link(
            `#/browse?size=${size}&rectifiable=no`,
            `${summary.nonTilers} tile none`,
          )
        : "none are known to tile no rectangle",
      summary.unknown.length > 0
        ? `, and ${noun(summary.unknown.length)} ${summary.unknown.length === 1 ? "is" : "are"} undecided.`
        : ", and none are undecided.",
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
