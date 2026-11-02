import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RectangleSize } from "../src/core/model";
import { Polyomino } from "../src/core/polyomino";
import { allPrimesEven, PrimeClosure } from "../src/core/prime-closure";
import {
  DataStore,
  PROJECT_ROOT,
  printHelpIfAsked,
  reportConflicts,
} from "./lib/store";

const USAGE = `Imports Michael Reid's prime rectangle pages (cflmath.com, via web.archive.org) into data/.

Usage: npx tsx tools/import-reid.ts [--pages <dir>]

  --pages  folder with the downloaded *_rect.html pages (default scratch/reid)

Results become "proven" with ref reid-rectifiable-data (page name as detail), flagged untraced.
With a complete prime list, the smallest square and the odd order are derived by gluing primes.`;

const SOURCE_REF = "reid-rectifiable-data";
const CLOSURE_LIMIT = 400;
const GENERIC_NAMES = new Set([
  "tromino",
  "tetromino",
  "pentomino",
  "hexomino",
  "heptomino",
  "octomino",
  "enneomino",
  "dekomino",
  "hendekomino",
  "dodekomino",
]);
const RECTANGLE_PATTERN = /(\d+)\s*&times;\s*(\d+)/g;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function rectanglesIn(text: string): RectangleSize[] {
  return [...text.matchAll(RECTANGLE_PATTERN)].map(
    (m) => [Number(m[1]), Number(m[2])] as const,
  );
}

interface ReidPage {
  readonly file: string;
  readonly polyomino: Polyomino;
  readonly name: string;
  readonly primes: RectangleSize[];
  readonly complete: boolean;
  readonly smallest: RectangleSize[];
  readonly smallestOdd: RectangleSize[];
  readonly oddIsOnlyKnown: boolean;
}

function parsePage(file: string, html: string): ReidPage {
  const art = /<!--([\s\S]*?)-->/.exec(html)?.[1];
  if (art === undefined || !art.includes("*"))
    throw new Error(`${file}: no ASCII shape`);
  const rows = art
    .split(/\r?\n/)
    .filter((row) => row.includes("*"))
    .map((row) => row.replace(/\*/g, "#").replace(/[^#]/g, "."));
  const polyomino = Polyomino.fromRows(rows).canonical();

  const title =
    /<h1>\s*Primes of the\s+([\s\S]*?)<\/h1>/
      .exec(html)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
  // The prime list is the paragraph after the picture, up to the first rule.
  const afterTitle = html.slice(html.indexOf("</h1>"));
  const primeBlock = afterTitle.slice(0, afterTitle.indexOf("<hr>"));
  const primeText = primeBlock.replace(/<img[^>]*>/g, "");
  const plain = primeText
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const complete =
    /\bcomplete\s*$/.test(plain) && !/incomplete\s*$/.test(plain);

  const line = (label: RegExp): string | undefined =>
    label.exec(html.replace(/<br>/g, "\n"))?.[1];
  const smallestText = line(/smallest rectangles?:([^\n<]*)/);
  const oddText = line(/smallest (?:known )?odd rectangles?:([^\n<]*)/);
  return {
    file,
    polyomino,
    name: title,
    primes: rectanglesIn(primeText),
    complete,
    smallest: smallestText === undefined ? [] : rectanglesIn(smallestText),
    smallestOdd: oddText === undefined ? [] : rectanglesIn(oddText),
    oddIsOnlyKnown: /smallest known odd rectangle/.test(html),
  };
}

const INCOMPLETE_PRIMES_NOTE =
  "Reid lists these prime rectangles but does not claim the list is complete; larger primes may exist.";

function importPage(store: DataStore, page: ReidPage): void {
  const { polyomino, primes, complete } = page;
  const n = polyomino.size;
  const common = {
    ref: SOURCE_REF,
    refDetail: page.file,
    untraced: true,
  } as const;
  const set = (
    key: Parameters<DataStore["setProperty"]>[1],
    record: object,
  ): void =>
    store.setProperty(
      polyomino,
      key,
      { status: "proven", ...common, ...record },
      `reid ${page.file}`,
    );

  if (!GENERIC_NAMES.has(page.name) && page.name !== "")
    store.addName(polyomino, page.name);
  set("rectifiable", { value: true });
  if (page.smallest.length === 0)
    throw new Error(`${page.file}: no smallest rectangle`);
  const areas = new Set(page.smallest.map(([w, h]) => w * h));
  if (areas.size !== 1)
    throw new Error(`${page.file}: smallest rectangles of different areas`);
  const order = ([...areas][0] as number) / n;
  if (!Number.isInteger(order))
    throw new Error(`${page.file}: smallest area is not a multiple of ${n}`);
  if (!polyomino.isRectangle()) {
    set("order", { value: order });
    set("smallestRectangles", {
      value: page.smallest.map(([w, h]) => (w <= h ? [w, h] : [h, w])),
    });
  }
  if (primes.length > 0)
    set("primeRectangles", {
      value: { rectangles: primes, complete },
      ...(!complete && { status: "open", note: INCOMPLETE_PRIMES_NOTE }),
    });

  if (page.smallestOdd.length > 0) {
    const oddCopies =
      ((page.smallestOdd[0] as RectangleSize)[0] *
        (page.smallestOdd[0] as RectangleSize)[1]) /
      n;
    if (oddCopies % 2 !== 1)
      throw new Error(`${page.file}: odd rectangle holds ${oddCopies} copies`);
    if (page.oddIsOnlyKnown)
      store.setProperty(
        polyomino,
        "oddOrder",
        {
          status: "open",
          upper: oddCopies,
          ...common,
          note: "Smallest known odd rectangle.",
        },
        `reid ${page.file}`,
      );
    else set("oddOrder", { value: oddCopies });
  }

  if (!complete) return;
  const derived = {
    ...common,
    status: "proven",
    reason:
      "Derived from the complete list of prime rectangles: every tileable rectangle is glued from primes.",
  } as const;
  const minSide = Math.min(...primes.map(([w, h]) => Math.min(w, h)));
  const closure = new PrimeClosure(primes, CLOSURE_LIMIT);
  const square = closure.smallestSquare();
  if (square !== undefined)
    store.setProperty(
      polyomino,
      "smallestSquare",
      { ...derived, value: square },
      `reid ${page.file} closure`,
    );
  if (allPrimesEven(primes, n)) {
    store.setProperty(
      polyomino,
      "oddOrder",
      {
        ...derived,
        value: "none",
        reason:
          "Every prime rectangle holds an even number of copies, so every tileable rectangle does.",
      },
      `reid ${page.file} parity`,
    );
  } else {
    const odd = closure.oddOrder(n, minSide);
    if (odd !== undefined)
      store.setProperty(
        polyomino,
        "oddOrder",
        { ...derived, value: odd },
        `reid ${page.file} closure`,
      );
  }
}

printHelpIfAsked(USAGE);
const directory = argument("--pages", join(PROJECT_ROOT, "scratch", "reid"));
const store = new DataStore();
let imported = 0;
for (const file of readdirSync(directory)
  .filter((f) => f.endsWith("_rect.html"))
  .sort()) {
  const html = readFileSync(join(directory, file), "latin1");
  if (!/Primes of/.test(html)) {
    console.log(
      `skipped ${file}: not a prime rectangle page (missing from the archive?)`,
    );
    continue;
  }
  const page = parsePage(file, html);
  importPage(store, page);
  imported++;
}
console.log(`imported ${imported} pages`, store.save());
reportConflicts(store.conflicts);
