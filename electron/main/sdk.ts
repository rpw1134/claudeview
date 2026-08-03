import { createRequire } from 'node:module'
import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk'

/**
 * Loads the Claude Agent SDK into the Electron main process.
 *
 * ## Why this indirection exists
 *
 * A plain `import { query } from '@anthropic-ai/claude-agent-sdk'` **hangs forever**
 * in Electron's main process. Not slowly — the promise never settles, `app` stays
 * responsive, and nothing is thrown. Verified against Electron 40 / SDK 0.3.220:
 * `await import(...)` never resolves, while the identical call from plain Node
 * completes in well under a second.
 *
 * The trigger is Electron's ESM loader meeting this particular module: `sdk.mjs` is
 * ~1.2MB packed into ~141 extremely long lines. Going through `createRequire`
 * instead routes the load through Node's CJS loader (Node 22+ can `require()` an
 * ESM package), which loads the same file in ~100ms.
 *
 * So: **runtime** access goes through `require`, while **types** come from a
 * type-only import that is erased at compile time. `verbatimModuleSyntax` in
 * tsconfig guarantees the `import type` never turns back into a runtime import and
 * silently reintroduces the hang.
 *
 * If a future Electron or SDK release fixes the ESM path, this file is the single
 * place to revert — nothing else in the codebase imports the SDK directly.
 */
const nodeRequire = createRequire(import.meta.url)

const sdk: typeof AgentSdk = nodeRequire('@anthropic-ai/claude-agent-sdk')

export const query = sdk.query
export const listSessions = sdk.listSessions

export type {
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
