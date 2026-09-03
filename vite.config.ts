import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Content-hashed filenames so every deploy gets a fresh URL: Netlify serves
        // /assets/* with a one-year immutable Cache-Control, so a hashless filename
        // meant returning visitors' browsers kept the previous deploy's JS/CSS forever.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  test: {
    // Vitest owns the unit/integration suite; tests/browser belongs to Playwright.
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/browser/**'],
    setupFiles: ['./tests/setup.ts'],
  }
});
