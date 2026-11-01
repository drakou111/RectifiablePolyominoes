import { cpSync } from "node:fs";
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

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  build: { outDir: outputDirectory },
  plugins: [copyDataFiles()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
