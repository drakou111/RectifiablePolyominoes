import { COMPLETE_SIZE, type CatalogItem } from "../../core/catalog";
import {
  PROPERTY_FILTER_OPTIONS,
  YES_NO_KEYS,
  sortItems,
  standing,
  type SortColumn,
  type Standing,
} from "../../core/browse-query";
import { isNotApplicable, type PropertyKey } from "../../core/model";
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

const SIZE_NAMES = [
  "Monominoes",
  "Dominoes",
  "Trominoes",
  "Tetrominoes",
  "Pentominoes",
  "Hexominoes",
  "Heptominoes",
  "Octominoes",
  "Nonominoes",
  "Decominoes",
  "Hendecominoes",
  "Dodecominoes",
  "Tridecominoes",
  "Tetradecominoes",
  "Pentadecominoes",
];

/** "Pentominoes", or "11-ominoes" past the named sizes. */
export function sizeName(size: number): string {
  return SIZE_NAMES[size - 1] ?? `${size}-ominoes`;
}

/** Property columns; `label` is the heading, `title` the full name shown on hover. */
const PROPERTY_COLUMNS: readonly {
  readonly key: PropertyKey;
  readonly label: string;
  readonly title: string;
}[] = [
  { key: "rectifiable", label: "Rectangle", title: "Tiles a rectangle" },
  { key: "order", label: "Order", title: "Order" },
  { key: "oddOrder", label: "Odd order", title: "Odd order" },
  {
    key: "smallestRectangles",
    label: "Smallest rect.",
    title: "Smallest rectangles",
  },
  { key: "smallestSquare", label: "Square", title: "Smallest square" },
  { key: "minColors", label: "Colors", title: "Fewest colors" },
  { key: "tilesHalfStrip", label: "Half-strip", title: "Tiles a half-strip" },
];
const PROPERTY_COLUMN_KEYS = new Set<string>(
  PROPERTY_COLUMNS.map((column) => column.key),
);
const OTHER_SORT_COLUMNS = new Set<string>([
  "size",
  "id",
  "symmetry",
  "tilings",
]);

interface BrowseFilters {
  query: string;
  size: string;
  symmetry: string;
  holes: "any" | "no" | "yes";
  tilings: "any" | "some" | "none";
  /** Per property column: the standing a row must have. */
  standings: Partial<Record<PropertyKey, Standing>>;
  sort: SortColumn;
  descending: boolean;
  page: number;
}

const defaultFilters = (): BrowseFilters => ({
  query: "",
  size: "",
  symmetry: "",
  holes: "any",
  tilings: "any",
  standings: {},
  sort: "size",
  descending: false,
  page: 1,
});

const optionsFor = (key: PropertyKey) =>
  PROPERTY_FILTER_OPTIONS[YES_NO_KEYS.has(key) ? "yesNo" : "valued"];

function readFilters(params: URLSearchParams): BrowseFilters {
  const filters = defaultFilters();
  filters.query = params.get("query") ?? "";
  filters.size = params.get("size") ?? "";
  filters.symmetry = params.get("symmetry") ?? "";
  const holes = params.get("holes");
  if (holes === "no" || holes === "yes") filters.holes = holes;
  const tilings = params.get("tilings");
  if (tilings === "some" || tilings === "none") filters.tilings = tilings;
  for (const { key } of PROPERTY_COLUMNS) {
    const value = params.get(key);
    if (optionsFor(key).some(([option]) => option === value && value !== "any"))
      filters.standings[key] = value as Standing;
  }
  const sort = params.get("sort") ?? "";
  if (PROPERTY_COLUMN_KEYS.has(sort) || OTHER_SORT_COLUMNS.has(sort))
    filters.sort = sort as SortColumn;
  filters.descending = params.get("dir") === "desc";
  filters.page = Math.max(1, Number(params.get("page")) || 1);
  return filters;
}

function writeFilters(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.query !== "") params.set("query", filters.query);
  if (filters.size !== "") params.set("size", filters.size);
  if (filters.symmetry !== "") params.set("symmetry", filters.symmetry);
  if (filters.holes !== "any") params.set("holes", filters.holes);
  if (filters.tilings !== "any") params.set("tilings", filters.tilings);
  for (const [key, value] of Object.entries(filters.standings))
    params.set(key, value);
  if (filters.sort !== "size") params.set("sort", filters.sort);
  if (filters.descending) params.set("dir", "desc");
  if (filters.page > 1) params.set("page", String(filters.page));
  const text = params.toString();
  return text === "" ? "#/browse" : `#/browse?${text}`;
}

/** True when any filter narrows the rows. */
function isFiltered(filters: BrowseFilters): boolean {
  return (
    filters.query !== "" ||
    filters.size !== "" ||
    filters.symmetry !== "" ||
    filters.holes !== "any" ||
    filters.tilings !== "any" ||
    Object.keys(filters.standings).length > 0
  );
}

function matches(item: CatalogItem, filters: BrowseFilters): boolean {
  if (filters.size !== "" && item.size !== Number(filters.size)) return false;
  if (filters.symmetry !== "" && item.symmetry !== filters.symmetry)
    return false;
  if (filters.holes !== "any" && item.hasHole !== (filters.holes === "yes"))
    return false;
  if (
    filters.tilings !== "any" &&
    item.tilings.length > 0 !== (filters.tilings === "some")
  )
    return false;
  for (const [key, wanted] of Object.entries(filters.standings))
    if (standing(item, key as PropertyKey) !== wanted) return false;
  if (filters.query !== "") {
    const query = filters.query.toLowerCase();
    const haystack = [item.id, ...(item.entry?.names ?? [])]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

/** A compact filter for a column heading; marked when it narrows the rows. */
function columnFilter(
  label: string,
  current: string,
  options: readonly (readonly [string, string])[],
  onChange: (value: string) => void,
): HTMLSelectElement {
  const element = h("select", {
    class: current === (options[0]?.[0] ?? "") ? "" : "active",
    "aria-label": `Filter: ${label}`,
    onchange: (event) => onChange((event.target as HTMLSelectElement).value),
  });
  for (const [value, text] of options)
    element.append(h("option", { value, selected: value === current }, text));
  return element;
}

export function propertyCell(
  item: CatalogItem,
  key: PropertyKey,
): HTMLTableCellElement {
  const record = item.properties[key];
  if (record === undefined)
    return isNotApplicable(key, item.properties)
      ? h(
          "td",
          {
            class: "unknown",
            title: "Tiles no rectangle, so this is undefined",
          },
          "n/a",
        )
      : h("td", { class: "unknown", title: "No data yet" }, "-");
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

interface Column {
  readonly label: string;
  readonly title?: string;
  readonly sort?: SortColumn;
  readonly numeric?: boolean;
  readonly filter?: HTMLSelectElement;
  readonly cell: (item: CatalogItem) => HTMLTableCellElement;
}

function resultsTable(
  items: readonly CatalogItem[],
  columns: readonly Column[],
  filters: BrowseFilters,
  onSort: (column: SortColumn) => void,
): HTMLElement {
  const labels = h(
    "tr",
    {},
    ...columns.map((column) => {
      const { sort } = column;
      const className = column.numeric ? "numeric" : "";
      if (sort === undefined)
        return h(
          "th",
          { class: className, title: column.title ?? "" },
          column.label,
        );
      const active = filters.sort === sort;
      return h(
        "th",
        {
          class: `${className} sortable`,
          "aria-sort": active
            ? filters.descending
              ? "descending"
              : "ascending"
            : "none",
        },
        h(
          "button",
          {
            type: "button",
            title: `${column.title ?? column.label}: ${active ? "click to reverse" : "click to sort"}`,
            onclick: () => onSort(sort),
          },
          column.label,
        ),
      );
    }),
  );
  const filterRow = h(
    "tr",
    { class: "column-filters" },
    ...columns.map((column) => h("th", {}, column.filter ?? "")),
  );
  const rows = items.map((item) =>
    h("tr", {}, ...columns.map((column) => column.cell(item))),
  );
  return h(
    "div",
    { class: "table-scroll" },
    h(
      "table",
      { class: "catalogue" },
      h("thead", {}, labels, filterRow),
      h("tbody", {}, ...rows),
    ),
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
  const onSort = (column: SortColumn): void =>
    update(
      filters.sort === column
        ? { descending: !filters.descending }
        : { sort: column, descending: false },
    );
  const setStanding = (key: PropertyKey, value: string): void => {
    const standings = Object.fromEntries(
      Object.entries(filters.standings).filter(([other]) => other !== key),
    ) as BrowseFilters["standings"];
    if (value !== "any") standings[key] = value as Standing;
    update({ standings });
  };

  const sizes = Array.from({ length: context.catalog.maxSize }, (_, i) =>
    String(i + 1),
  );
  const symmetries = Object.keys(SYMMETRY_DESCRIPTIONS) as SymmetryGroup[];
  // Built per draw so each select shows the current filter.
  const columns = (): Column[] => [
    {
      label: "Shape",
      filter: columnFilter(
        "holes",
        filters.holes,
        [
          ["any", "any"],
          ["no", "no holes"],
          ["yes", "holes"],
        ],
        (value) => update({ holes: value as BrowseFilters["holes"] }),
      ),
      cell: (item) =>
        h(
          "td",
          { class: "thumb" },
          link(
            polyominoHref(item.id),
            renderPolyomino(item.polyomino, "shape thumbnail"),
          ),
        ),
    },
    {
      label: "ID",
      sort: "id",
      cell: (item) =>
        h(
          "td",
          {},
          link(polyominoHref(item.id), h("code", {}, item.id)),
          item.entry?.names?.length
            ? h("div", { class: "muted" }, item.entry.names.join(", "))
            : null,
        ),
    },
    {
      label: "Cells",
      sort: "size",
      numeric: true,
      filter: columnFilter(
        "cells",
        filters.size,
        [["", "any"], ...sizes.map((s) => [s, s] as const)],
        (size) => update({ size }),
      ),
      cell: (item) => h("td", { class: "numeric" }, item.size),
    },
    ...PROPERTY_COLUMNS.map((column): Column => ({
      label: column.label,
      title: column.title,
      sort: column.key,
      filter: columnFilter(
        column.title,
        filters.standings[column.key] ?? "any",
        optionsFor(column.key),
        (value) => setStanding(column.key, value),
      ),
      cell: (item) => propertyCell(item, column.key),
    })),
    {
      label: "Symmetry",
      sort: "symmetry",
      filter: columnFilter(
        "symmetry",
        filters.symmetry,
        [["", "any"], ...symmetries.map((s) => [s, s] as const)],
        (symmetry) => update({ symmetry }),
      ),
      cell: (item) =>
        h("td", { title: SYMMETRY_DESCRIPTIONS[item.symmetry] }, item.symmetry),
    },
    {
      label: "Tilings",
      sort: "tilings",
      numeric: true,
      filter: columnFilter(
        "tilings",
        filters.tilings,
        [
          ["any", "any"],
          ["some", "stored"],
          ["none", "none"],
        ],
        (value) => update({ tilings: value as BrowseFilters["tilings"] }),
      ),
      cell: (item) => h("td", { class: "numeric" }, item.tilings.length || ""),
    },
  ];

  const clearButton = h(
    "button",
    {
      type: "button",
      onclick: () => {
        const fresh = defaultFilters();
        location.hash = writeFilters(fresh);
      },
    },
    "Clear filters",
  );
  const summary = h("span", { class: "muted" });

  const drawResults = (): void => {
    const matching = sortItems(
      context.catalog.items.filter((item) => matches(item, filters)),
      filters.sort,
      filters.descending,
    );
    const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const shown = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    summary.textContent = `${matching.length} polyominoes match.`;
    clearButton.hidden = !isFiltered(filters);
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
      resultsTable(shown, columns(), filters, onSort),
      shown.length === 0 ? h("p", {}, "Nothing matches these filters.") : "",
      pager || "",
    );
  };

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
    clearButton,
    summary,
  );

  drawResults();
  return h(
    "section",
    { class: "catalogue-page" },
    h("h1", {}, "Catalogue"),
    h(
      "p",
      {},
      `Every polyomino with up to ${COMPLETE_SIZE} cells that tiles a rectangle or is open, and selected larger ones; `,
      link("#/sizes", "Sizes"),
      " gives the counts. ",
      "Click a heading to sort by it (again to reverse); the menus under the headings filter the rows.",
    ),
    controls,
    results,
    h("p", {}, allDataDownloadButton(context)),
  );
}
