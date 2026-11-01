import { MAX_GENERATED_SIZE, type CatalogItem } from "../../core/catalog";
import type { PropertyKey } from "../../core/model";
import {
  SYMMETRY_DESCRIPTIONS,
  type SymmetryGroup,
} from "../../core/polyomino";
import { polyominoHref, type SiteContext } from "../context";
import { h, link, type Child } from "../dom";
import { answerClass, formatProperty } from "../format";
import { allDataDownloadButton } from "../download";
import { renderPolyomino } from "../render";

const PAGE_SIZE = 100;

interface BrowseFilters {
  query: string;
  size: string;
  rectifiable: "any" | "yes" | "no" | "open" | "unknown";
  data: "entered" | "any";
  symmetry: string;
  holes: "any" | "no" | "yes";
  sort: "size" | "order" | "colors";
  page: number;
}

const DEFAULT_FILTERS: BrowseFilters = {
  query: "",
  size: "",
  rectifiable: "any",
  data: "entered",
  symmetry: "",
  holes: "any",
  sort: "size",
  page: 1,
};

const TABLE_COLUMNS: readonly {
  readonly key: PropertyKey;
  readonly label: string;
}[] = [
  { key: "rectifiable", label: "Tiles a rectangle" },
  { key: "order", label: "Order" },
  { key: "oddOrder", label: "Odd order" },
  { key: "smallestRectangles", label: "Smallest rectangles" },
  { key: "minColors", label: "Fewest colors" },
  { key: "tilesHalfStrip", label: "Tiles a half-strip" },
  { key: "tilesPlane", label: "Tiles the plane" },
];

function readFilters(params: URLSearchParams): BrowseFilters {
  const filters: BrowseFilters = { ...DEFAULT_FILTERS };
  const read = <K extends keyof BrowseFilters>(
    key: K,
    allowed?: readonly string[],
  ): void => {
    const value = params.get(key);
    if (value === null || (allowed !== undefined && !allowed.includes(value)))
      return;
    (filters as unknown as Record<string, unknown>)[key] =
      key === "page" ? Math.max(1, Number(value) || 1) : value;
  };
  read("query");
  read("size");
  read("rectifiable", ["any", "yes", "no", "open", "unknown"]);
  read("data", ["entered", "any"]);
  read("symmetry");
  read("holes", ["any", "no", "yes"]);
  read("sort", ["size", "order", "colors"]);
  read("page");
  return filters;
}

function writeFilters(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== DEFAULT_FILTERS[key as keyof BrowseFilters])
      params.set(key, String(value));
  const text = params.toString();
  return text === "" ? "#/browse" : `#/browse?${text}`;
}

function matches(item: CatalogItem, filters: BrowseFilters): boolean {
  if (filters.data === "entered" && item.entry === undefined) return false;
  if (filters.size !== "" && item.size !== Number(filters.size)) return false;
  if (filters.symmetry !== "" && item.symmetry !== filters.symmetry)
    return false;
  if (filters.holes !== "any" && item.hasHole !== (filters.holes === "yes"))
    return false;
  const rectifiable = item.properties.rectifiable;
  switch (filters.rectifiable) {
    case "yes":
    case "no":
      if (rectifiable?.value !== (filters.rectifiable === "yes")) return false;
      break;
    case "open":
      if (rectifiable?.status !== "open") return false;
      break;
    case "unknown":
      if (rectifiable !== undefined) return false;
      break;
  }
  if (filters.query !== "") {
    const query = filters.query.toLowerCase();
    const haystack = [item.id, ...(item.entry?.names ?? [])]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function sortKey(item: CatalogItem, sort: BrowseFilters["sort"]): number {
  const unknownLast = Number.MAX_SAFE_INTEGER;
  if (sort === "order")
    return (
      item.properties.order?.value ??
      item.properties.order?.lower ??
      unknownLast
    );
  if (sort === "colors") return item.properties.minColors?.value ?? unknownLast;
  return item.size;
}

function select(
  name: string,
  current: string,
  options: readonly (readonly [string, string])[],
  onChange: (value: string) => void,
): HTMLLabelElement {
  const element = h("select", {
    name,
    onchange: (event) => onChange((event.target as HTMLSelectElement).value),
  });
  for (const [value, label] of options)
    element.append(h("option", { value, selected: value === current }, label));
  return h("label", {}, element);
}

function propertyCell(
  item: CatalogItem,
  key: PropertyKey,
): HTMLTableCellElement {
  const record = item.properties[key];
  if (record === undefined) return h("td", { class: "unknown" }, "-");
  return h(
    "td",
    {
      class: [`status-${record.status}`, answerClass(record.value)]
        .filter(Boolean)
        .join(" "),
    },
    formatProperty(key, record),
  );
}

function resultsTable(items: readonly CatalogItem[]): HTMLTableElement {
  const head = h(
    "tr",
    {},
    h("th", {}, "Shape"),
    h("th", {}, "ID"),
    h("th", { class: "numeric" }, "Cells"),
    ...TABLE_COLUMNS.map((column) => h("th", {}, column.label)),
    h("th", {}, "Symmetry"),
    h("th", { class: "numeric" }, "Tilings"),
  );
  const rows = items.map((item) =>
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
      h("td", { class: "numeric" }, item.size),
      ...TABLE_COLUMNS.map((column) => propertyCell(item, column.key)),
      h("td", { title: SYMMETRY_DESCRIPTIONS[item.symmetry] }, item.symmetry),
      h("td", { class: "numeric" }, item.tilings.length || ""),
    ),
  );
  return h(
    "table",
    { class: "catalogue" },
    h("thead", {}, head),
    h("tbody", {}, ...rows),
  );
}

export function browsePage(
  context: SiteContext,
  params: URLSearchParams,
): HTMLElement {
  const filters = readFilters(params);
  const results = h("div");

  const update = (change: Partial<BrowseFilters>): void => {
    Object.assign(filters, { page: 1 }, change);
    history.replaceState(null, "", writeFilters(filters));
    drawResults();
  };

  const drawResults = (): void => {
    const matching = context.catalog.items.filter((item) =>
      matches(item, filters),
    );
    if (filters.sort !== "size")
      matching.sort(
        (a, b) => sortKey(a, filters.sort) - sortKey(b, filters.sort),
      );
    const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const shown = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pager: Child =
      pageCount > 1 &&
      h(
        "p",
        { class: "pager" },
        h(
          "button",
          { disabled: page <= 1, onclick: () => update({ page: page - 1 }) },
          "Previous",
        ),
        ` Page ${page} of ${pageCount} `,
        h(
          "button",
          {
            disabled: page >= pageCount,
            onclick: () => update({ page: page + 1 }),
          },
          "Next",
        ),
      );
    results.replaceChildren(
      h("p", { class: "muted" }, `${matching.length} polyominoes match.`),
      shown.length > 0
        ? resultsTable(shown)
        : h("p", {}, "Nothing matches these filters."),
      pager || "",
    );
  };

  const sizes = Array.from({ length: context.catalog.maxSize }, (_, i) =>
    String(i + 1),
  );
  const symmetries = Object.keys(SYMMETRY_DESCRIPTIONS) as SymmetryGroup[];
  const search = h("input", {
    type: "search",
    placeholder: "ID or name, e.g. fe70",
    value: filters.query,
    oninput: (event) =>
      update({ query: (event.target as HTMLInputElement).value.trim() }),
  });

  const controls = h(
    "form",
    { class: "filters", onsubmit: (event) => event.preventDefault() },
    h("label", {}, "Search ", search),
    "Cells ",
    select(
      "size",
      filters.size,
      [["", "any"], ...sizes.map((s) => [s, s] as const)],
      (size) => update({ size }),
    ),
    "Tiles a rectangle ",
    select(
      "rectifiable",
      filters.rectifiable,
      [
        ["any", "any"],
        ["yes", "yes"],
        ["no", "no"],
        ["open", "open problem"],
        ["unknown", "no data"],
      ],
      (value) => update({ rectifiable: value as BrowseFilters["rectifiable"] }),
    ),
    "Symmetry ",
    select(
      "symmetry",
      filters.symmetry,
      [["", "any"], ...symmetries.map((s) => [s, s] as const)],
      (symmetry) => update({ symmetry }),
    ),
    "Holes ",
    select(
      "holes",
      filters.holes,
      [
        ["any", "any"],
        ["no", "no holes"],
        ["yes", "has holes"],
      ],
      (value) => update({ holes: value as BrowseFilters["holes"] }),
    ),
    "Sort by ",
    select(
      "sort",
      filters.sort,
      [
        ["size", "cells, then ID"],
        ["order", "order"],
        ["colors", "fewest colors"],
      ],
      (value) => update({ sort: value as BrowseFilters["sort"] }),
    ),
    h(
      "label",
      {},
      h("input", {
        type: "checkbox",
        checked: filters.data === "entered",
        onchange: (event) =>
          update({
            data: (event.target as HTMLInputElement).checked
              ? "entered"
              : "any",
          }),
      }),
      " Only polyominoes with entered data",
    ),
  );

  drawResults();
  return h(
    "section",
    {},
    h("h1", {}, "Catalogue"),
    h(
      "p",
      {},
      `Every free polyomino with up to ${MAX_GENERATED_SIZE} cells has a page, as does every larger one with entered data. Untick the last filter to include those without entered data. `,
      "Facts that follow from the shape alone (holes, rectangles) are filled in automatically.",
    ),
    controls,
    h("p", {}, allDataDownloadButton(context)),
    results,
  );
}
