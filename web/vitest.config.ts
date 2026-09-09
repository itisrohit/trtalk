import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Widget tests opt into jsdom via a `// @vitest-environment jsdom` header.
    environmentMatchGlobs: [['tests/widget/**', 'jsdom']],
  },
})
