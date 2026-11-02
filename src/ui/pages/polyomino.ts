import type { CatalogItem } from "../../core/catalog";
import {
  groupTilings,
  type TilingGroup,
  type TilingSlot,
} from "../../core/tiling-groups";
import type { Coloring } from "../../core/coloring";
import {
  PROPERTY_DEFINITIONS,
  STATUS_DESCRIPTIONS,
  isNotApplicable,
} from "../../core/model";
import { ORIENTATION_COUNT, SYMMETRY_DESCRIPTIONS } from "../../core/polyomino";
import { expandTiling } from "../../core/tiling";
import { loadTiling } from "../../data";
import type { SiteContext } from "../context";
import { append, h, link } from "../dom";
import {
  answerClass,
  citationLink,
  formatProperty,
  statusBadge,
} from "../format";
import { polyominoDownloadButton } from "../download";
import {
  COLOR_MODES,
  renderPolyomino,
  renderTiling,
  type ColorMode,
} from "../render";

function propertiesTable(
  item: CatalogItem,
  context: SiteContext,
): HTMLTableElement {
  const rows = PROPERTY_DEFINITIONS.map((definition) => {
    const record = item.properties[definition.key];
    const derived =
      item.derivedKeys.has(definition.key) &&
      item.entry?.properties[definition.key] === undefined;
    const source =
      record === undefined
        ? null
        : record.ref !== undefined
          ? citationLink(
              record.ref,
              context.references.get(record.ref),
              record.refDetail,
            )
          : derived
            ? h("span", { class: "muted" }, "derived automatically")
            : null;
    return h(
      "tr",
      {},
      h(
        "th",
        { scope: "row", title: definition.description },
        definition.label,
      ),
      h(
        "td",
        {},
        record === undefined
          ? h(
              "span",
              { class: "muted" },
              isNotApplicable(definition.key, item.properties)
                ? "not applicable (tiles no rectangle)"
                : "no data",
            )
          : h(
              "span",
              { class: answerClass(record.value) },
              formatProperty(definition.key, record),
            ),
      ),
      h(
        "td",
        {},
        record &&
          h(
            "span",
            { title: STATUS_DESCRIPTIONS[record.status] },
            statusBadge(record.status),
          ),
      ),
      h(
        "td",
        {},
        source,
        record?.untraced &&
          h(
            "span",
            {
              class: "badge unchecked",
              title:
                "The citation is the data source; the first publication is not yet traced",
            },
            "first publication not traced",
          ),
        record?.reason && h("div", {}, record.reason),
        record?.note && h("div", { class: "muted" }, record.note),
      ),
    );
  });
  return h(
    "table",
    { class: "properties" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, "Property"),
        h("th", {}, "Value"),
        h("th", {}, "Status"),
        h("th", {}, "Source and notes"),
      ),
    ),
    h("tbody", {}, ...rows),
  );
}

function orientationsFigure(item: CatalogItem): HTMLElement {
  const figures = [];
  for (let k = 0; k < ORIENTATION_COUNT; k++)
    figures.push(
      h(
        "figure",
        {},
        renderPolyomino(item.polyomino.oriented(k), "shape orientation"),
        h("figcaption", {}, `o = ${k}`),
      ),
    );
  return h(
    "details",
    {},
    h(
      "summary",
      {},
      `The 8 orientations (${item.polyomino.distinctOrientations().length} distinct), as used in tiling files`,
    ),
    h(
      "p",
      { class: "muted" },
      "Orientation o turns the shape clockwise by 90 x (o mod 4) degrees, then mirrors it left to right if o >= 4. ",
      "A placement {o, x, y} puts the top-left corner of that orientation's bounding box at column x, row y.",
    ),
    h("div", { class: "orientations" }, ...figures),
  );
}

/** Small tilings stay small instead of filling the page. */
const MAX_CELL_PIXELS = 28;

interface PictureOptions {
  readonly context: SiteContext;
  readonly mode: () => ColorMode;
  readonly register: (redraw: () => void) => void;
  /** Colorings by tiling path: exact coloring is slow, and a tiling can appear in several groups. */
  readonly colorings: Map<string, Coloring>;
}

/** A figure for one slot: the stored tiling, or a placeholder when none is stored. */
function tilingCard(
  slot: TilingSlot,
  group: TilingGroup,
  options: PictureOptions,
): HTMLElement {
  const caption = h("figcaption", {}, h("strong", {}, slot.caption));
  const { ref } = slot;
  if (ref === undefined) {
    caption.append(h("div", { class: "muted" }, "No tiling stored yet."));
    return h("figure", { class: "tiling-card missing" }, caption);
  }
  const picture = h(
    "div",
    { class: "picture" },
    h("p", { class: "muted" }, "Loading..."),
  );
  if (slot.repeatOf !== undefined)
    caption.append(
      h(
        "div",
        { class: "muted" },
        "Same tiling as under ",
        h(
          "a",
          {
            href: `#tilings-${slot.repeatOf.key}`,
            onclick: (event: Event) => {
              event.preventDefault();
              document
                .getElementById(`tilings-${slot.repeatOf?.key ?? ""}`)
                ?.scrollIntoView();
            },
          },
          slot.repeatOf.title,
        ),
        ".",
      ),
    );
  const card = h(
    "figure",
    {
      class: slot.repeatOf === undefined ? "tiling-card" : "tiling-card repeat",
    },
    picture,
    caption,
  );
  const { context } = options;

  loadTiling(ref.path).then(
    (file) => {
      const polyomino = context.catalog.get(ref.polyominoId)?.polyomino;
      if (polyomino === undefined)
        throw new Error(`Unknown polyomino ${ref.polyominoId}`);
      const expanded = expandTiling(
        polyomino,
        file.width,
        file.height,
        file.placements,
      );
      let coloring = options.colorings.get(ref.path);
      const colorInfo = h("span");
      const redraw = (): void => {
        const mode = group.forceFewestColors ? "fewest" : options.mode();
        const drawn = renderTiling(expanded, file.placements, mode, coloring);
        coloring = drawn.coloring ?? coloring;
        if (coloring !== undefined) options.colorings.set(ref.path, coloring);
        drawn.element.style.maxWidth = `${file.width * MAX_CELL_PIXELS}px`;
        picture.replaceChildren(drawn.element);
        colorInfo.textContent =
          coloring === undefined
            ? ""
            : `Needs ${coloring.exact ? "exactly" : "at most"} ${coloring.colorCount} colors. `;
      };
      redraw();
      if (!group.forceFewestColors) options.register(redraw);
      if (slot.repeatOf !== undefined) return;
      append(caption, [
        h(
          "div",
          {},
          file.width > file.height
            ? `Stored as ${file.width} x ${file.height}. `
            : "",
          colorInfo,
          link(`data/${ref.path}`, "JSON"),
        ),
        file.ref &&
          h(
            "div",
            {},
            "Source: ",
            citationLink(file.ref, context.references.get(file.ref)),
          ),
        file.note && !group.compact && h("div", { class: "muted" }, file.note),
        expanded.problems.length > 0 &&
          h(
            "div",
            { class: "error" },
            `Invalid tiling: ${expanded.problems.join("; ")}`,
          ),
      ]);
    },
    (error: unknown) =>
      picture.replaceChildren(
        h(
          "p",
          { class: "error" },
          `Could not load the tiling: ${String(error)}`,
        ),
      ),
  );
  return card;
}

function tilingGroupSection(
  group: TilingGroup,
  options: PictureOptions,
): HTMLElement {
  const stored = group.slots.filter((slot) => slot.ref !== undefined);
  // In a gallery, empty boxes would drown the pictures: list the missing ones in one line.
  const shown = group.compact ? stored : group.slots;
  const missing = group.compact
    ? group.slots.filter((slot) => slot.ref === undefined)
    : [];
  return h(
    "section",
    { class: "tiling-group", id: `tilings-${group.key}` },
    h("h3", {}, group.title),
    h(
      "p",
      { class: "muted" },
      group.description,
      group.slots.length > 1
        ? ` ${stored.length} of ${group.slots.length} have a stored tiling.`
        : "",
    ),
    shown.length > 0 &&
      h(
        "div",
        { class: group.compact ? "tiling-grid compact" : "tiling-grid" },
        ...shown.map((slot) => tilingCard(slot, group, options)),
      ),
    missing.length > 0 &&
      h(
        "p",
        { class: "muted" },
        "No tiling stored yet: ",
        missing.map((slot) => slot.caption).join(", "),
        ".",
      ),
  );
}

export function polyominoPage(context: SiteContext, id: string): HTMLElement {
  const item = context.catalog.get(id);
  if (item === undefined)
    return h(
      "section",
      {},
      h("h1", {}, "Not in the catalogue"),
      h(
        "p",
        {},
        "No polyomino with ID ",
        h("code", {}, id),
        " is listed. IDs are canonical; see ",
        link("#/guide/notation", "the notation"),
        ".",
      ),
    );

  const { polyomino } = item;
  let mode: ColorMode = "fewest";
  const redraws: (() => void)[] = [];
  const modeSelect = h("select", {
    onchange: (event) => {
      mode = (event.target as HTMLSelectElement).value as ColorMode;
      for (const redraw of redraws) redraw();
    },
  });
  for (const option of COLOR_MODES)
    modeSelect.append(h("option", { value: option.mode }, option.label));

  const groups = groupTilings(item);
  const pictureOptions: PictureOptions = {
    context,
    mode: () => mode,
    register: (redraw) => redraws.push(redraw),
    colorings: new Map(),
  };
  const tilings =
    groups.length === 0
      ? h(
          "p",
          { class: "muted" },
          polyomino.isRectangle()
            ? "The piece is itself a rectangle."
            : "No tilings recorded.",
        )
      : h(
          "div",
          {},
          h(
            "nav",
            { class: "tiling-nav" },
            ...groups.flatMap((group, i) => [
              i > 0 ? " | " : "",
              h(
                "a",
                {
                  href: `#tilings-${group.key}`,
                  onclick: (event: Event) => {
                    event.preventDefault();
                    document
                      .getElementById(`tilings-${group.key}`)
                      ?.scrollIntoView();
                  },
                },
                group.title,
              ),
            ]),
          ),
          h("label", {}, "Coloring ", modeSelect),
          ...groups.map((group) => tilingGroupSection(group, pictureOptions)),
        );

  const dataPath = `data/polyominoes/${item.size}/${item.id}.json`;
  return h(
    "section",
    {},
    h(
      "h1",
      {},
      h("code", {}, item.id),
      item.entry?.names?.length
        ? ` - ${item.entry.names.filter((n) => n !== item.id).join(", ")}`
        : "",
    ),
    h(
      "div",
      { class: "shape-header" },
      renderPolyomino(polyomino, "shape large"),
      h(
        "dl",
        {},
        h("dt", {}, "Cells"),
        h("dd", {}, item.size),
        h("dt", {}, "Bounding box"),
        h("dd", {}, `${polyomino.width} x ${polyomino.height}`),
        h("dt", {}, "Symmetry"),
        h(
          "dd",
          {},
          `${item.symmetry} (${SYMMETRY_DESCRIPTIONS[item.symmetry]})`,
        ),
        h("dt", {}, "Holes"),
        h("dd", {}, item.hasHole ? "yes" : "no"),
        h("dt", {}, "Data file"),
        h(
          "dd",
          {},
          item.entry === undefined
            ? h("span", { class: "muted" }, `none yet (would be ${dataPath})`)
            : link(dataPath, h("code", {}, dataPath)),
        ),
        h("dt", {}, "Download"),
        h("dd", {}, polyominoDownloadButton(item, context)),
      ),
    ),
    item.entry?.note && h("p", {}, item.entry.note),
    item.entry?.seeAlso?.length
      ? h(
          "p",
          {},
          "See also: ",
          ...item.entry.seeAlso.flatMap((ref, i) => [
            i > 0 ? "; " : "",
            citationLink(ref, context.references.get(ref)),
          ]),
          ".",
        )
      : null,
    h("h2", {}, "Properties"),
    propertiesTable(item, context),
    orientationsFigure(item),
    h("h2", {}, "Tilings"),
    tilings,
  );
}
