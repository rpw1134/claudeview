import { defineConfig } from 'vite'
import path from 'node:path'

/**
 * Bundles the test entry so it can run under plain Node.
 *
 * The layout tree is pure, so it needs no DOM and no Electron — the whole point of
 * keeping arrangement logic out of the components is that its invariants can be
 * checked directly.
 */
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  build: {
    ssr: true,
    outDir: path.resolve(__dirname, '../.test-dist'),
    emptyOutDir: true,
    lib: { entry: path.resolve(__dirname, 'layoutTree.test.ts'), formats: ['es'], fileName: 'tests' },
  },
})
