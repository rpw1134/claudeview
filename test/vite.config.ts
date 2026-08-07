import { defineConfig } from 'vite'
import path from 'node:path'

/**
 * Bundles the test entry so it can run under plain Node.
 *
 * Everything under test is pure, so it needs no DOM and no Electron — the whole
 * point of keeping arrangement and message-composition logic out of the components
 * is that their invariants can be checked directly.
 */
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    ssr: true,
    outDir: path.resolve(__dirname, '../.test-dist'),
    emptyOutDir: true,
    lib: { entry: path.resolve(__dirname, 'index.test.ts'), formats: ['es'] },
  },
})
