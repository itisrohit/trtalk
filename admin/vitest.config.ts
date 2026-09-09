import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true, // lets @testing-library/react auto-cleanup between tests
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
})
