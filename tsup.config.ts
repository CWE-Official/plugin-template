import { defineConfig } from "tsup";

// The platform's distribution contract: ONE self-contained ESM file with the
// SDK (host-provided) and zod (shared instance) external. The default export
// of dist/index.js is the definePlugin object the runtime loads.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  clean: true,
  target: "node20",
  external: ["@cwe-platform/plugin-sdk", "zod"],
});
