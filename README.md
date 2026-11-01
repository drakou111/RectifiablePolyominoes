# Rectangle Tilings

A static website cataloguing which polyominoes tile rectangles: order, odd order, smallest rectangles and squares, prime rectangles, plane tilings and the fewest colors a rectangle tiling needs, each linked to its first publication. Every free polyomino up to 10 cells gets a page. Data is hand-entered JSON in `data/`, checked by the test suite. Built with TypeScript and Vite, hosted on GitHub Pages.

## Setup

Requires Node 22 or newer.

```sh
npm install
```

## Usage

```sh
npm run dev      # local site at http://localhost:5173
npm test         # unit tests plus validation of everything in data/
npm run check    # typecheck, lint, format check, tests
npm run build    # check, then build the static site into dist/
```

To add data, see the site's guide page "Data format and contributing" (`src/guide/data-format.html`). Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml` (enable Pages with source "GitHub Actions" in the repository settings).
