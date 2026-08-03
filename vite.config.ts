import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

/**
 * Modules the main-process bundle must NOT inline.
 *
 * `@anthropic-ai/claude-agent-sdk` is the important one. It locates and spawns the
 * `claude` CLI binary using paths relative to its own package directory. Inlining
 * it into `dist-electron/main/index.js` moves that resolution base and the SDK
 * throws "Native CLI binary not found" at runtime. It must stay a real import
 * resolved against node_modules — which is also why it belongs in `dependencies`
 * rather than `devDependencies`, so electron-builder ships it.
 */
const EXTERNAL_MAIN_DEPS = ['electron', '@anthropic-ai/claude-agent-sdk']

/**
 * Three build targets live in this config:
 *
 *  - renderer  (src/)               -> dist/          , browser context, no Node access
 *  - main      (electron/main/)     -> dist-electron/ , Node context, owns the Agent SDK
 *  - preload   (electron/preload/)  -> dist-electron/ , bridge between the two
 *
 * The Agent SDK is marked `external` for the main build. It resolves and spawns the
 * `claude` CLI from its own package directory at runtime; bundling it would break that
 * path resolution. It must stay a real require() against node_modules.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            // Vite 8 bundles with Rolldown, so externals go under `rolldownOptions`.
            // `rollupOptions` is kept alongside it for forward/backward compatibility;
            // whichever the installed Vite honours, the SDK stays external.
            rolldownOptions: { external: EXTERNAL_MAIN_DEPS },
            rollupOptions: { external: EXTERNAL_MAIN_DEPS },
          },
        },
      },
      preload: {
        input: 'electron/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
              // Preload must be CommonJS: Electron loads it with `sandbox: false`
              // but ESM preload support is still gated behind a .mjs extension and
              // adds no benefit here.
              output: { format: 'cjs', entryFileNames: 'index.cjs' },
            },
          },
        },
      },
    }),
  ],
})
