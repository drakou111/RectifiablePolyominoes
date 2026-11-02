import { MAX_GENERATED_SIZE, type CatalogItem } from "../../core/catalog";
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

const TABLE_COLUMNS: readonly {
  readonly key: PropertyKey;
  readonly label: string;
}[] = [
  { key: "rectifiable", label: "Tiles a rectangle" },
  { key: "order", label: "Order" },
  { key: "oddOrder", label: "Odd order" },
  { key: "smallestRectangles", label: "Smallest rectangles" },
  { key: "smallestSquare", label: "Smallest square" },
  { key: "minColors", label: "Fewest colors" },
  { key: "tilesHalfStrip", label: "Tiles a half-strip" },
  { key: "tilesPlane", label: "Tiles the plane" },
];
const COLUMN_KEYS = new Set<string>(TABLE_COLUMNS.map((column) => column.key));
const OTHER_SORT_COLUMNS = new Set<string>([
  "size",
  "id",
  "symmetry",
  "tilings",
]);

interface BrowseFilters {
  query: string;
  size: string;
  data: "entered" | "any";
  symmetry: string;
  holes: "any" | "no" | "yes";
  /** Per property column: the standing a row must have. */
  standings: Partial<Record<PropertyKey, Standing>>;
  sort: SortColumn;
  descending: boolean;
  page: number;
}

const defaultFilters = (): BrowseFilters => ({
  query: "",
  size: "",
  data: "entered",
  symmetry: "",
  holes: "any",
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
  if (params.get("data") === "any") filters.data = "any";
  const holes = params.get("holes");
  if (holes === "no" || holes === "yes") filters.holes = holes;
  for (const { key } of TABLE_COLUMNS) {
    const value = params.get(key);
    if (optionsFor(key).some(([option]) => option === value && value !== "any"))
      filters.standings[key] = value as Standing;
  }
  const sort = params.get("sort") ?? "";
  if (COLUMN_KEYS.has(sort) || OTHER_SORT_COLUMNS.has(sort))
    filters.sort = sort as SortColumn;
  filters.descending = params.get("dir") === "desc";
  filters.page = Math.max(1, Number(params.get("page")) || 1);
  return filters;
}

function writeFilters(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.query !== "") params.set("query", filters.query);
  if (filters.size !== "") params.set("size", filters.size);
  if (filters.data !== "entered") params.set("data", filters.data);
  if (filters.symmetry !== "") params.set("symmetry", filters.symmetry);
  if (filters.holes !== "any") params.set("holes", filters.holes);
  for (const [key, value] of Object.entries(filters.standings))
    params.set(key, value);
  if (filters.sort !== "size") params.set("sort", filters.sort);
  if (filters.descending) params.set("dir", "desc");
  if (filters.page > 1) params.set("page", String(filters.page));
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

function select(
  name: string,
  current: string,
  options: readonly (readonly [string, string])[],
  onChange: (value: string) => void,
): HTMLSelectElement {
  const element = h("select", {
    name,
    onchange: (event) => onChange((event.target as HTMLSelectElement).value),
  });
  for (const [value, label] of options)
    element.append(h("option", { value, selected: value === current }, label));
  return element;
}

function propertyCell(
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

function resultsTable(
  items: readonly CatalogItem[],
  filters: BrowseFilters,
  onSort: (column: SortColumn) => void,
): HTMLTableElement {
  const header = (
    column: SortColumn,
    label: string,
    numeric = false,
  ): HTMLTableCellElement => {
    const active = filters.sort === column;
    return h(
      "th",
      {
        class: numeric ? "numeric sortable" : "sortable",
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
          title: active
            ? "Click to reverse the order"
            : `Sort by ${label.toLowerCase()}`,
          onclick: () => onSort(column),
        },
        label,
      ),
    );
  };
  const head = h(
    "tr",
    {},
    h("th", {}, "Shape"),
    header("id", "ID"),
    header("size", "Cells", true),
    ...TABLE_COLUMNS.map((column) => header(column.key, column.label)),
    header("symmetry", "Symmetry"),
    header("tilings", "Tilings", true),
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
  const onSort = (column: SortColumn): void =>
    update(
      filters.sort === column
        ? { descending: !filters.descending }
        : { sort: column, descending: false },
    );

  const drawResults = (): void => {
    const matching = sortItems(
      context.catalog.items.filter((item) => matches(item, filters)),
      filters.sort,
      filters.descending,
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
        ? resultsTable(shown, filters, onSort)
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
  const labelled = (label: string, control: HTMLElement): HTMLLabelElement =>
    h("label", {}, `${label} `, control);

  const controls = h(
    "form",
    { class: "filters", onsubmit: (event) => event.preventDefault() },
    h(
      "div",
      { class: "filter-row" },
      labelled("Search", search),
      labelled(
        "Cells",
        select(
          "size",
          filters.size,
          [["", "any"], ...sizes.map((s) => [s, s] as const)],
          (size) => update({ size }),
        ),
      ),
      labelled(
        "Symmetry",
        select(
          "symmetry",
          filters.symmetry,
          [["", "any"], ...symmetries.map((s) => [s, s] as const)],
          (symmetry) => update({ symmetry }),
        ),
      ),
      labelled(
        "Holes",
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
    ),
    h(
      "div",
      { class: "filter-row" },
      ...TABLE_COLUMNS.map((column) =>
        labelled(
          column.label,
          select(
            column.key,
            filters.standings[column.key] ?? "any",
            optionsFor(column.key),
            (value) => {
              const standings = Object.fromEntries(
                Object.entries(filters.standings).filter(
                  ([key]) => key !== column.key,
                ),
              ) as BrowseFilters["standings"];
              if (value !== "any") standings[column.key] = value as Standing;
              update({ standings });
            },
          ),
        ),
      ),
      h(
        "button",
        {
          type: "button",
          onclick: () => {
            const fresh = defaultFilters();
            location.hash = writeFilters(fresh);
          },
        },
        "Clear filters",
      ),
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
      `Every free polyomino with up to ${MAX_GENERATED_SIZE} cells has a page, as does every larger one with entered data. Untick "Only polyominoes with entered data" to include those without. `,
      "Facts that follow from the shape alone (holes, rectangles) are filled in automatically. ",
      "Click a column heading to sort by it; click again to reverse.",
    ),
    controls,
    h("p", {}, allDataDownloadButton(context)),
    results,
  );
}
