import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// Builds the embeddable widget into a single self-contained dist/widget.js
// (IIFE) the gateway serves and a customer pastes via <script>.
export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: 'src/widget/index.ts',
      name: 'TrTalkWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
