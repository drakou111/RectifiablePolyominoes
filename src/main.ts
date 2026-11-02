import "./style.css";
import { loadCatalog, loadReferences } from "./data";
import type { SiteContext } from "./ui/context";
import { h } from "./ui/dom";
import { browsePage } from "./ui/pages/browse";
import { guidePage } from "./ui/pages/guide";
import { polyominoPage } from "./ui/pages/polyomino";
import { homePage, openProblemsPage, referencesPage } from "./ui/pages/simple";
import { sizePage, sizesPage } from "./ui/pages/sizes";

const SITE_TITLE = "Rectifiable Polyominoes";

const main = document.querySelector("main");
if (main === null) throw new Error("index.html needs a <main> element");

const context: SiteContext = {
  catalog: loadCatalog(),
  references: loadReferences(),
};

function render(): void {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path = "/", query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  const [section, argument] = path.split("/").filter(Boolean);

  let page: HTMLElement;
  switch (section) {
    case undefined:
      page = homePage(context);
      break;
    case "browse":
      page = browsePage(context, params);
      break;
    case "p":
      page = polyominoPage(context, decodeURIComponent(argument ?? ""));
      break;
    case "sizes":
      page = sizesPage(context);
      break;
    case "size":
      page = sizePage(context, argument ?? "");
      break;
    case "open":
      page = openProblemsPage(context, params);
      break;
    case "references":
      page = referencesPage(context, params);
      break;
    case "guide":
      page = guidePage(context, argument);
      break;
    default:
      page = h("section", {}, h("h1", {}, "Page not found"));
  }

  const heading = page.querySelector("h1")?.textContent;
  document.title =
    heading && section !== undefined
      ? `${heading} - ${SITE_TITLE}`
      : SITE_TITLE;
  (main as HTMLElement).replaceChildren(page);
  if (!params.has("ref")) window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
render();
