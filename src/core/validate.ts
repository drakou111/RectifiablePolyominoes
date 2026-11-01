import { minimumColoring } from "./coloring";
import { deriveProperties } from "./derived";
import {
  PROPERTY_KEYS,
  REFERENCE_KINDS,
  STATUSES,
  type PolyominoEntry,
  type Properties,
  type PropertyKey,
  type PropertyRecord,
  type Reference,
  type Tiling,
} from "./model";
import { Polyomino } from "./polyomino";
import { expandTiling, pieceAdjacency } from "./tiling";

/** A data file: its path relative to data/ (e.g. "polyominoes/10/fe70.json") and parsed JSON. */
export interface DataFile {
  readonly path: string;
  readonly content: unknown;
}

export interface ValidatedData {
  readonly errors: readonly string[];
  readonly entries: ReadonlyMap<string, PolyominoEntry>;
  readonly tilings: readonly Tiling[];
  readonly references: ReadonlyMap<string, Reference>;
}

const ENTRY_PATH = /^polyominoes\/(\d+)\/([^/]+)\.json$/;
const TILING_PATH = /^tilings\/([^/]+)\/(\d+)x(\d+)(?:-[a-z0-9-]+)?\.json$/;
const REFERENCE_KEY = /^[a-z0-9-]+$/;
const MAX_COLORS = 4;
const PROPERTY_FIELDS = new Set([
  "status",
  "value",
  "lower",
  "upper",
  "ref",
  "refDetail",
  "reason",
  "note",
  "untraced",
]);
const ENTRY_FIELDS = new Set(["id", "names", "note", "seeAlso", "properties"]);
const TILING_FIELDS = new Set(["width", "height", "placements", "ref", "note"]);
const REFERENCE_FIELDS = new Set([
  "kind",
  "authors",
  "title",
  "year",
  "venue",
  "volume",
  "pages",
  "doi",
  "url",
  "checked",
]);

type Record_ = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Record_ =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;
const isRectangleSize = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 2 && value.every(isPositiveInteger);

/** Checks a single property's value has the right shape. Returns an error message or undefined. */
function checkValue(key: PropertyKey, value: unknown): string | undefined {
  switch (key) {
    case "rectifiable":
    case "tilesHalfStrip":
    case "tilesPlane":
      return typeof value === "boolean" ? undefined : "must be true or false";
    case "order":
      return isPositiveInteger(value)
        ? undefined
        : "must be a positive integer";
    case "minColors":
      return isPositiveInteger(value) && value <= MAX_COLORS
        ? undefined
        : "must be an integer from 1 to 4";
    case "oddOrder":
      return value === "none" || (isPositiveInteger(value) && value % 2 === 1)
        ? undefined
        : 'must be an odd positive integer or "none"';
    case "smallestSquare":
      return value === "none" || isPositiveInteger(value)
        ? undefined
        : 'must be a positive integer or "none"';
    case "smallestRectangles":
      return Array.isArray(value) &&
        value.length > 0 &&
        value.every(isRectangleSize)
        ? undefined
        : "must be a non-empty list of [width, height] pairs";
    case "primeRectangles":
      return isObject(value) &&
        typeof value.complete === "boolean" &&
        Array.isArray(value.rectangles) &&
        value.rectangles.every(isRectangleSize)
        ? undefined
        : "must be { rectangles: [[w, h], ...], complete: boolean }";
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

class Validator {
  readonly errors: string[] = [];
  readonly entries = new Map<string, PolyominoEntry>();
  readonly polyominoes = new Map<string, Polyomino>();
  readonly tilings: Tiling[] = [];
  readonly references = new Map<string, Reference>();

  error(where: string, message: string): void {
    this.errors.push(`${where}: ${message}`);
  }

  checkFields(
    where: string,
    object: Record_,
    allowed: ReadonlySet<string>,
  ): void {
    for (const field of Object.keys(object))
      if (!allowed.has(field)) this.error(where, `unknown field "${field}"`);
  }

  loadReferences(file: DataFile): void {
    const where = file.path;
    if (!isObject(file.content)) {
      this.error(where, "must be an object mapping keys to references");
      return;
    }
    for (const [key, raw] of Object.entries(file.content)) {
      const at = `${where} [${key}]`;
      if (!REFERENCE_KEY.test(key))
        this.error(at, "key must use lowercase letters, digits and dashes");
      if (!isObject(raw)) {
        this.error(at, "must be an object");
        continue;
      }
      this.checkFields(at, raw, REFERENCE_FIELDS);
      if (!(REFERENCE_KINDS as readonly unknown[]).includes(raw.kind))
        this.error(at, `kind must be one of ${REFERENCE_KINDS.join(", ")}`);
      if (
        !Array.isArray(raw.authors) ||
        raw.authors.length === 0 ||
        !raw.authors.every((a) => typeof a === "string")
      )
        this.error(at, "authors must be a non-empty list of strings");
      if (typeof raw.title !== "string" || raw.title === "")
        this.error(at, "title is required");
      if (raw.year !== undefined && !isPositiveInteger(raw.year))
        this.error(at, "year must be an integer");
      if (raw.doi === undefined && raw.url === undefined)
        this.error(at, "needs a doi or a url");
      if (typeof raw.checked !== "boolean")
        this.error(at, "checked must be true or false");
      this.references.set(key, raw as unknown as Reference);
    }
  }

  checkReference(where: string, ref: unknown): void {
    if (ref === undefined) return;
    if (typeof ref !== "string" || !this.references.has(ref))
      this.error(where, `unknown reference "${String(ref)}"`);
  }

  loadEntry(file: DataFile): void {
    const where = file.path;
    const match = ENTRY_PATH.exec(file.path);
    if (match === null) {
      this.error(where, "entries must live at polyominoes/<size>/<id>.json");
      return;
    }
    const [, sizeText, fileId] = match as unknown as [string, string, string];
    const raw = file.content;
    if (!isObject(raw)) {
      this.error(where, "must be an object");
      return;
    }
    this.checkFields(where, raw, ENTRY_FIELDS);
    if (raw.id !== fileId)
      this.error(where, `id "${String(raw.id)}" does not match the file name`);

    let polyomino: Polyomino;
    try {
      polyomino = Polyomino.fromId(fileId);
    } catch (error) {
      this.error(where, (error as Error).message);
      return;
    }
    if (polyomino.id !== fileId)
      this.error(where, `"${fileId}" is not canonical; use "${polyomino.id}"`);
    if (polyomino.size !== Number(sizeText))
      this.error(
        where,
        `has ${polyomino.size} cells but sits in folder ${sizeText}`,
      );
    if (this.entries.has(fileId)) this.error(where, "duplicate entry");
    if (
      raw.names !== undefined &&
      !(
        Array.isArray(raw.names) &&
        raw.names.every((n) => typeof n === "string")
      )
    )
      this.error(where, "names must be a list of strings");
    if (raw.seeAlso !== undefined) {
      if (Array.isArray(raw.seeAlso))
        for (const ref of raw.seeAlso)
          this.checkReference(`${where} [seeAlso]`, ref);
      else this.error(where, "seeAlso must be a list of reference keys");
    }
    if (!isObject(raw.properties)) {
      this.error(where, "properties must be an object");
      return;
    }
    this.checkProperties(where, raw.properties, polyomino);
    this.entries.set(fileId, raw as unknown as PolyominoEntry);
    this.polyominoes.set(fileId, polyomino);
  }

  checkProperties(
    where: string,
    properties: Record_,
    polyomino: Polyomino,
  ): void {
    const derived = deriveProperties(polyomino);
    for (const [key, raw] of Object.entries(properties)) {
      const at = `${where} [${key}]`;
      if (!(PROPERTY_KEYS as readonly string[]).includes(key)) {
        this.error(at, "unknown property");
        continue;
      }
      if (!isObject(raw)) {
        this.error(at, "must be an object");
        continue;
      }
      this.checkFields(at, raw, PROPERTY_FIELDS);
      const record = raw as unknown as PropertyRecord<unknown>;
      if (!STATUSES.includes(record.status))
        this.error(at, `status must be one of ${STATUSES.join(", ")}`);
      if (record.status !== "open" && record.value === undefined)
        this.error(at, "a settled property needs a value");
      if (record.status === "open" && record.value !== undefined)
        this.error(at, "an open property cannot have a value");
      if (record.status !== "open" && record.ref === undefined)
        this.error(
          at,
          "a settled property needs a ref to its first publication",
        );
      if (record.value !== undefined) {
        const problem = checkValue(key as PropertyKey, record.value);
        if (problem !== undefined) this.error(at, `value ${problem}`);
      }
      for (const bound of ["lower", "upper"] as const)
        if (record[bound] !== undefined && !isPositiveInteger(record[bound]))
          this.error(at, `${bound} must be a positive integer`);
      if (
        record.lower !== undefined &&
        record.upper !== undefined &&
        record.lower > record.upper
      )
        this.error(at, "lower bound exceeds upper bound");
      this.checkReference(at, record.ref);
      if (record.untraced !== undefined && record.untraced !== true)
        this.error(at, "untraced must be true when present");
      if (record.untraced && record.ref === undefined)
        this.error(at, "untraced needs the ref of the data source");
      const derivedRecord = derived[key as PropertyKey];
      if (
        derivedRecord !== undefined &&
        record.value !== undefined &&
        !sameValue(derivedRecord.value, record.value)
      )
        this.error(
          at,
          `contradicts the shape: ${derivedRecord.reason ?? "derived value"}`,
        );
    }

    const effective: Properties = { ...derived, ...(properties as Properties) };
    const rectifiable = effective.rectifiable?.value;
    if (rectifiable === true && effective.tilesHalfStrip?.value === false)
      this.error(
        where,
        "tiles a rectangle but is recorded as not tiling a half-strip",
      );
    if (
      effective.tilesHalfStrip?.value === true &&
      effective.tilesPlane?.value === false
    )
      this.error(
        where,
        "tiles a half-strip but is recorded as not tiling the plane",
      );
    if (rectifiable === true && effective.tilesPlane?.value === false)
      this.error(
        where,
        "tiles a rectangle but is recorded as not tiling the plane",
      );
    if (rectifiable === false)
      for (const key of [
        "order",
        "oddOrder",
        "smallestRectangles",
        "smallestSquare",
        "minColors",
      ] as const)
        if (effective[key]?.value !== undefined)
          this.error(where, `${key} is set but the piece tiles no rectangle`);
    const order = effective.order?.value;
    const oddOrder = effective.oddOrder?.value;
    if (order !== undefined && typeof oddOrder === "number" && oddOrder < order)
      this.error(where, "odd order is smaller than the order");
    const smallest = effective.smallestRectangles?.value;
    if (order !== undefined && smallest !== undefined)
      for (const [w, h] of smallest)
        if (w * h !== order * polyomino.size)
          this.error(
            where,
            `smallest rectangle ${w}x${h} does not hold exactly order (${order}) copies`,
          );
  }

  loadTiling(file: DataFile): void {
    const where = file.path;
    const match = TILING_PATH.exec(file.path);
    if (match === null) {
      this.error(
        where,
        "tilings must live at tilings/<id>/<width>x<height>.json (optionally <width>x<height>-<label>.json)",
      );
      return;
    }
    const [, polyominoId, widthText, heightText] = match as unknown as [
      string,
      string,
      string,
      string,
    ];
    const raw = file.content;
    if (!isObject(raw)) {
      this.error(where, "must be an object");
      return;
    }
    this.checkFields(where, raw, TILING_FIELDS);
    const polyomino = this.polyominoes.get(polyominoId);
    if (polyomino === undefined) {
      this.error(where, `no entry file for polyomino "${polyominoId}"`);
      return;
    }
    if (raw.width !== Number(widthText) || raw.height !== Number(heightText))
      this.error(where, "width and height must match the file name");
    if (
      !isPositiveInteger(raw.width) ||
      !isPositiveInteger(raw.height) ||
      !Array.isArray(raw.placements)
    ) {
      this.error(
        where,
        "needs positive integer width, height and a placements list",
      );
      return;
    }
    this.checkReference(where, raw.ref);
    const placements = raw.placements as Tiling["placements"];
    const expanded = expandTiling(polyomino, raw.width, raw.height, placements);
    for (const problem of expanded.problems) this.error(where, problem);
    if (expanded.problems.length > 0) return;

    const tiling: Tiling = { ...(raw as unknown as Tiling), polyominoId };
    this.tilings.push(tiling);
    this.checkTilingAgainstEntry(
      where,
      tiling,
      polyomino,
      pieceAdjacency(expanded, placements.length),
    );
  }

  checkTilingAgainstEntry(
    where: string,
    tiling: Tiling,
    polyomino: Polyomino,
    adjacency: number[][],
  ): void {
    const entry = this.entries.get(tiling.polyominoId);
    const properties: Properties = {
      ...deriveProperties(polyomino),
      ...entry?.properties,
    };
    const copies = tiling.placements.length;
    if (properties.rectifiable?.value === false)
      this.error(where, "the entry says this piece tiles no rectangle");
    const order = properties.order;
    if (order?.value !== undefined && copies < order.value)
      this.error(
        where,
        `uses ${copies} copies, fewer than the order ${order.value}`,
      );
    if (order?.lower !== undefined && copies < order.lower)
      this.error(
        where,
        `uses ${copies} copies, below the order's lower bound ${order.lower}`,
      );
    const oddOrder = properties.oddOrder?.value;
    if (
      copies % 2 === 1 &&
      (oddOrder === "none" ||
        (typeof oddOrder === "number" && copies < oddOrder))
    )
      this.error(
        where,
        `uses an odd number of copies (${copies}), contradicting the odd order`,
      );
    const square = properties.smallestSquare?.value;
    if (
      tiling.width === tiling.height &&
      (square === "none" ||
        (typeof square === "number" && tiling.width < square))
    )
      this.error(
        where,
        "is a square smaller than the recorded smallest square",
      );
    const minColors = properties.minColors?.value;
    if (minColors !== undefined) {
      const coloring = minimumColoring(adjacency);
      if (coloring.exact && coloring.colorCount < minColors)
        this.error(
          where,
          `can be colored with ${coloring.colorCount} colors, fewer than minColors ${minColors}`,
        );
    }
  }
}

/** Validates everything under data/. Load order matters: references, then entries, then tilings. */
export function validateData(
  referenceFile: DataFile,
  entryFiles: readonly DataFile[],
  tilingFiles: readonly DataFile[],
): ValidatedData {
  const validator = new Validator();
  validator.loadReferences(referenceFile);
  for (const file of entryFiles) validator.loadEntry(file);
  for (const file of tilingFiles) validator.loadTiling(file);
  return {
    errors: validator.errors,
    entries: validator.entries,
    tilings: validator.tilings,
    references: validator.references,
  };
}
