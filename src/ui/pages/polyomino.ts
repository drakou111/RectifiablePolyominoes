import type { CatalogItem, TilingRef } from "../../core/catalog";
import type { Coloring } from "../../core/coloring";
import { PROPERTY_DEFINITIONS, STATUS_DESCRIPTIONS } from "../../core/model";
import { ORIENTATION_COUNT, SYMMETRY_DESCRIPTIONS } from "../../core/polyomino";
import { expandTiling } from "../../core/tiling";
import { loadTiling } from "../../data";
import type { SiteContext } from "../context";
import { append, h, link } from "../dom";
import { citationLink, formatProperty, statusBadge } from "../format";
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
            ? h("span", { class: "muted" }, "follows from the shape")
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
          ? h("span", { class: "muted" }, "no data")
          : formatProperty(definition.key, record),
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

function tilingSection(
  ref: TilingRef,
  context: SiteContext,
  mode: () => ColorMode,
  register: (redraw: () => void) => void,
): HTMLElement {
  const body = h(
    "div",
    { class: "tiling-body" },
    h("p", { class: "muted" }, "Loading..."),
  );
  const section = h(
    "section",
    { class: "tiling" },
    h("h3", {}, `${ref.width} x ${ref.height}`),
    body,
  );

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
      let coloring: Coloring | undefined;
      const picture = h("div", { class: "picture" });
      const colorInfo = h("span");
      const redraw = (): void => {
        const drawn = renderTiling(expanded, file.placements, mode(), coloring);
        coloring = drawn.coloring ?? coloring;
        picture.replaceChildren(drawn.element);
        colorInfo.textContent =
          coloring === undefined
            ? ""
            : `; this tiling needs ${coloring.exact ? "exactly" : "at most"} ${coloring.colorCount} colors`;
      };
      redraw();
      register(redraw);
      body.replaceChildren();
      append(body, [
        h(
          "p",
          {},
          `${file.placements.length} copies`,
          colorInfo,
          file.ref &&
            h(
              "span",
              {},
              ". First published in ",
              citationLink(file.ref, context.references.get(file.ref)),
            ),
          ". ",
          link(`data/${ref.path}`, "Placements (JSON)"),
        ),
        expanded.problems.length > 0 &&
          h(
            "p",
            { class: "error" },
            `Invalid tiling: ${expanded.problems.join("; ")}`,
          ),
        file.note && h("p", {}, file.note),
        picture,
      ]);
    },
    (error: unknown) =>
      body.replaceChildren(
        h(
          "p",
          { class: "error" },
          `Could not load the tiling: ${String(error)}`,
        ),
      ),
  );
  return section;
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

  const tilings =
    item.tilings.length === 0
      ? h("p", { class: "muted" }, "No tilings recorded.")
      : h(
          "div",
          {},
          h("label", {}, "Coloring ", modeSelect),
          ...item.tilings.map((ref) =>
            tilingSection(
              ref,
              context,
              () => mode,
              (redraw) => redraws.push(redraw),
            ),
          ),
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
