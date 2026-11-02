import type { CatalogItem } from "../core/catalog";
import type { TilingFile } from "../core/model";
import { loadTiling } from "../data";
import type { SiteContext } from "./context";
import { h } from "./dom";

const DATA_FORMAT_VERSION = 1;

function shapeRows(item: CatalogItem): string[] {
  const { polyomino } = item;
  const rows: string[] = [];
  for (let y = 0; y < polyomino.height; y++) {
    let row = "";
    for (let x = 0; x < polyomino.width; x++)
      row += polyomino.has(x, y) ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

/** Everything the site knows about one polyomino, in one object. */
function summarize(item: CatalogItem): Record<string, unknown> {
  return {
    id: item.id,
    size: item.size,
    rows: shapeRows(item),
    symmetry: item.symmetry,
    hasHole: item.hasHole,
    names: item.entry?.names,
    note: item.entry?.note,
    seeAlso: item.entry?.seeAlso,
    properties: item.properties,
    derivedProperties: [...item.derivedKeys],
  };
}

async function tilingsOf(
  item: CatalogItem,
): Promise<(TilingFile & { polyominoId: string; file: string })[]> {
  return Promise.all(
    item.tilings.map(async (ref) => ({
      polyominoId: ref.polyominoId,
      file: `data/${ref.path}`,
      ...(await loadTiling(ref.path)),
    })),
  );
}

function saveJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 1)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = h("a", { href: url, download: fileName });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** A button that runs an async export and shows failures instead of hiding them. */
function exportButton(
  label: string,
  run: () => Promise<void>,
): HTMLButtonElement {
  const button = h("button", { type: "button" }, label);
  button.addEventListener("click", () => {
    button.disabled = true;
    run().then(
      () => (button.disabled = false),
      (error: unknown) => {
        button.disabled = false;
        button.textContent = `${label} (failed: ${String(error)})`;
      },
    );
  });
  return button;
}

/** Download of one polyomino: its shape, merged properties, the referenced sources and all its tilings. */
export function polyominoDownloadButton(
  item: CatalogItem,
  context: SiteContext,
): HTMLButtonElement {
  return exportButton("Download everything (JSON)", async () => {
    const refs = new Set<string>(item.entry?.seeAlso ?? []);
    for (const record of Object.values(item.properties))
      if (record?.ref !== undefined) refs.add(record.ref);
    const tilings = await tilingsOf(item);
    for (const tiling of tilings) if (tiling.ref) refs.add(tiling.ref);
    saveJson(`${item.id}.json`, {
      formatVersion: DATA_FORMAT_VERSION,
      ...summarize(item),
      tilings,
      references: Object.fromEntries(
        [...refs].map((key) => [key, context.references.get(key)]),
      ),
    });
  });
}

/** Download of the whole catalogue: every polyomino, every tiling, every reference. */
export function allDataDownloadButton(context: SiteContext): HTMLButtonElement {
  return exportButton("Download all data (JSON)", async () => {
    const items = context.catalog.items;
    const tilings = await Promise.all(
      items.filter((item) => item.tilings.length > 0).map(tilingsOf),
    );
    saveJson("rectangle-tilings-all-data.json", {
      formatVersion: DATA_FORMAT_VERSION,
      exported: new Date().toISOString(),
      orientationConvention:
        "o: rotate clockwise 90*(o mod 4) degrees from the ID drawing, then mirror left-right if o >= 4; x, y = top-left of that orientation's bounding box",
      references: Object.fromEntries(context.references),
      polyominoes: items.map(summarize),
      tilings: tilings.flat(),
    });
  });
}
