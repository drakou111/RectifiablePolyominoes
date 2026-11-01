import { cpSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const dataDirectory = fileURLToPath(new URL("./data", import.meta.url));
const outputDirectory = fileURLToPath(new URL("./dist", import.meta.url));

// The raw JSON is published next to the site so tilings can be downloaded as data.
function copyDataFiles(): Plugin {
  return {
    name: "copy-data-files",
    apply: "build",
    closeBundle() {
      cpSync(dataDirectory, `${outputDirectory}/data`, { recursive: true });
    },
  };
}

const ENTRIES_MODULE = "virtual:polyomino-entries";
const RESOLVED_ENTRIES_MODULE = String.fromCharCode(0) + ENTRIES_MODULE;
const entriesDirectory = join(dataDirectory, "polyominoes");

// Bundles every data/polyominoes/**/*.json into one module.
function polyominoEntries(): Plugin {
  return {
    name: "polyomino-entries",
    resolveId: (id) =>
      id === ENTRIES_MODULE ? RESOLVED_ENTRIES_MODULE : undefined,
    load(id) {
      if (id !== RESOLVED_ENTRIES_MODULE) return undefined;
      const entries: unknown[] = [];
      for (const size of readdirSync(entriesDirectory))
        for (const file of readdirSync(join(entriesDirectory, size))) {
          const path = join(entriesDirectory, size, file);
          this.addWatchFile(path);
          entries.push(JSON.parse(readFileSync(path, "utf8")));
        }
      return `export default ${JSON.stringify(entries)};`;
    },
    configureServer(server) {
      server.watcher.add(entriesDirectory);
      const reload = (path: string): void => {
        if (!path.startsWith(entriesDirectory)) return;
        const module = server.moduleGraph.getModuleById(
          RESOLVED_ENTRIES_MODULE,
        );
        if (module !== undefined) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", reload);
      server.watcher.on("change", reload);
      server.watcher.on("unlink", reload);
    },
  };
}

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  build: { outDir: outputDirectory },
  plugins: [polyominoEntries(), copyDataFiles()],
  server: { watch: { ignored: ["**/scratch/**", "**/output/**"] } },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
