import { defineConfig } from "vitest/config";

// Standalone test config: intentionally does not import vite.config.ts
// (the production build config pulls in plugins and options tests don't need).
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
