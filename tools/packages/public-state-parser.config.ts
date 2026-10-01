import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/public-state-parser',
    lib: {
      entry: 'packages/map/src/imported-dataset.ts',
      formats: ['es'],
      fileName: () => 'parser.mjs',
    },
    minify: false,
  },
});
