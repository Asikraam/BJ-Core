import { defineConfig } from 'vite';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  root: path.resolve(root, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(root, 'dist-renderer'),
    emptyOutDir: true,
  },
});
