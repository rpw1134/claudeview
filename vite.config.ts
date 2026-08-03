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
const EXTERNAL_MAIN_DEPS = ['electron', '@anthropic-ai/claude-agent-sdk', 'node-pty']

/**
 * Production CSP. The renderer makes no network requests of any kind — every byte
 * it needs comes over IPC — so `connect-src 'none'` is accurate rather than
 * aspirational, and it turns a stray fetch() into an immediate visible failure.
 */
const CSP_PRODUCTION =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; connect-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'"

/**
 * Dev CSP. Two unavoidable relaxations, both scoped to localhost:
 *
 *  - `connect-src ws://localhost:*` — Vite's HMR channel is a WebSocket. Under the
 *    production policy the renderer loads fine but the console fills with
 *    "Connecting to 'ws://localhost:5174' violates ... connect-src 'none'" and hot
 *    reload silently never works.
 *  - `script-src 'unsafe-inline'` — React Fast Refresh injects an inline preamble
 *    script into the served HTML.
 *
 * The port is wildcarded because Vite increments it when one is already taken
 * (5173 -> 5174 -> ...), and both `localhost` and `127.0.0.1` are listed because
 * which one is used depends on how the dev server resolves the host.
 */
const CSP_DEVELOPMENT =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; " +
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'"

/**
 * Swaps the `<!--CSP-->` placeholder in index.html for the policy matching the
 * current mode. Keeping the tag in the HTML (rather than sending a header) means
 * the policy also applies to the `file://` load used by the packaged app, where
 * there is no HTTP response to attach a header to.
 */
function cspPlugin(): import('vite').Plugin {
  return {
    name: 'claudeview-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const policy = ctx.server ? CSP_DEVELOPMENT : CSP_PRODUCTION
        return html.replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        )
      },
    },
  }
}

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
    cspPlugin(),
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
