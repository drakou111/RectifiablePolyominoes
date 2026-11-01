import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Placement,
  PolyominoEntry,
  PropertyKey,
  PropertyRecord,
  TilingFile,
} from "../../src/core/model";
import { PROPERTY_KEYS } from "../../src/core/model";
import { Polyomino } from "../../src/core/polyomino";

export const PROJECT_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const DATA_DIR = join(PROJECT_ROOT, "data");

type MutableEntry = {
  id: string;
  names?: string[];
  note?: string;
  seeAlso?: string[];
  properties: Partial<Record<PropertyKey, PropertyRecord<unknown>>>;
};

export interface Conflict {
  readonly id: string;
  readonly key: PropertyKey;
  readonly existing: unknown;
  readonly incoming: unknown;
  readonly source: string;
}

/**
 * Reads and writes entry and tiling files for import tools. Never overwrites a settled value
 * with a different one: such cases are collected as conflicts for a human to resolve.
 */
export class DataStore {
  readonly conflicts: Conflict[] = [];
  private readonly entries = new Map<string, MutableEntry>();
  private readonly dirty = new Set<string>();
  private tilingsWritten = 0;
  private tilingsSkipped = 0;

  entryPath(polyomino: Polyomino): string {
    return join(
      DATA_DIR,
      "polyominoes",
      String(polyomino.size),
      `${polyomino.id}.json`,
    );
  }

  entry(polyomino: Polyomino): MutableEntry {
    const id = polyomino.id;
    const cached = this.entries.get(id);
    if (cached !== undefined) return cached;
    const path = this.entryPath(polyomino);
    const entry: MutableEntry = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as MutableEntry)
      : { id, properties: {} };
    this.entries.set(id, entry);
    return entry;
  }

  addName(polyomino: Polyomino, name: string): void {
    const entry = this.entry(polyomino);
    const names = entry.names ?? [];
    if (names.includes(name)) return;
    entry.names = [...names, name];
    this.dirty.add(polyomino.id);
  }

  addSeeAlso(polyomino: Polyomino, ref: string): void {
    const entry = this.entry(polyomino);
    const list = entry.seeAlso ?? [];
    if (list.includes(ref)) return;
    entry.seeAlso = [...list, ref];
    this.dirty.add(polyomino.id);
  }

  /** Sets a property unless one is already present. Differing settled values become conflicts. */
  setProperty(
    polyomino: Polyomino,
    key: PropertyKey,
    record: PropertyRecord<unknown>,
    source: string,
  ): void {
    const entry = this.entry(polyomino);
    const existing = entry.properties[key];
    if (existing === undefined) {
      entry.properties[key] = record;
      this.dirty.add(polyomino.id);
      return;
    }
    if (
      existing.value !== undefined &&
      record.value !== undefined &&
      JSON.stringify(existing.value) !== JSON.stringify(record.value)
    )
      this.conflicts.push({
        id: polyomino.id,
        key,
        existing: existing.value,
        incoming: record.value,
        source,
      });
  }

  /** Replaces a property only while it is still open: used to tighten bounds or settle it. */
  replaceOpen(
    polyomino: Polyomino,
    key: PropertyKey,
    record: PropertyRecord<unknown>,
  ): boolean {
    const entry = this.entry(polyomino);
    const existing = entry.properties[key];
    if (existing !== undefined && existing.status !== "open") return false;
    entry.properties[key] = record;
    this.dirty.add(polyomino.id);
    return true;
  }

  hasProperty(polyomino: Polyomino, key: PropertyKey): boolean {
    return this.entry(polyomino).properties[key] !== undefined;
  }

  /** Writes a tiling file unless one with that name exists. Returns the path relative to data/. */
  writeTiling(
    polyomino: Polyomino,
    tiling: TilingFile,
    label?: string,
  ): string | undefined {
    const name = `${tiling.width}x${tiling.height}${label === undefined ? "" : `-${label}`}.json`;
    const relative = join("tilings", polyomino.id, name);
    const path = join(DATA_DIR, relative);
    if (existsSync(path)) {
      this.tilingsSkipped++;
      return undefined;
    }
    mkdirSync(dirname(path), { recursive: true });
    const placements = tiling.placements.map(
      (p: Placement) => `    { "o": ${p.o}, "x": ${p.x}, "y": ${p.y} }`,
    );
    const header = {
      width: tiling.width,
      height: tiling.height,
      ref: tiling.ref,
      note: tiling.note,
    };
    const headerLines = Object.entries(header)
      .filter(([, value]) => value !== undefined)
      .map(
        ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`,
      );
    writeFileSync(
      path,
      `{\n${headerLines.join("\n")}\n  "placements": [\n${placements.join(",\n")}\n  ]\n}\n`,
    );
    this.tilingsWritten++;
    return relative;
  }

  /** Writes every changed entry with a stable key order. */
  save(): { entries: number; tilingsWritten: number; tilingsSkipped: number } {
    for (const id of this.dirty) {
      const entry = this.entries.get(id) as MutableEntry;
      const polyomino = Polyomino.fromId(id);
      const properties: Record<string, unknown> = {};
      for (const key of PROPERTY_KEYS)
        if (entry.properties[key] !== undefined)
          properties[key] = entry.properties[key];
      const ordered: PolyominoEntry = {
        id: entry.id,
        ...(entry.names && { names: entry.names }),
        ...(entry.note && { note: entry.note }),
        ...(entry.seeAlso && { seeAlso: entry.seeAlso }),
        properties,
      };
      const path = this.entryPath(polyomino);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
    }
    return {
      entries: this.dirty.size,
      tilingsWritten: this.tilingsWritten,
      tilingsSkipped: this.tilingsSkipped,
    };
  }
}

export function printHelpIfAsked(usage: string): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }
}

export function reportConflicts(conflicts: readonly Conflict[]): void {
  if (conflicts.length === 0) return;
  console.log(`\n${conflicts.length} conflicts (existing value kept):`);
  for (const c of conflicts)
    console.log(
      `  ${c.id} ${c.key}: existing ${JSON.stringify(c.existing)}, ${c.source} says ${JSON.stringify(c.incoming)}`,
    );
}
