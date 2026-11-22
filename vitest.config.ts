import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Globals instead of `import { ... } from "vitest"` in test files: on Windows,
    // a lowercase drive letter in the working directory (e.g. VS Code terminals)
    // otherwise makes Vitest load two copies of itself and every suite fails.
    globals: true
  }
});
