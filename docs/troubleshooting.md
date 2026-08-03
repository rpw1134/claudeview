# Troubleshooting

## The Electron ESM hang

**Symptom.** Nothing happens. The window opens, the UI renders, but no session ever
starts. No error, no rejected promise, no stack trace. The app stays fully
responsive.

**Cause.** A static ESM import of the Agent SDK in Electron's **main process** never
resolves:

```ts
// Hangs forever in Electron main. Not slow — never settles.
import { query } from '@anthropic-ai/claude-agent-sdk'
await import('@anthropic-ai/claude-agent-sdk')
```

Verified against Electron 40.10.6 / SDK 0.3.220 / Node 24: `await import(...)`
produced no result after 2.5 minutes, while the identical call from plain Node
completed in well under a second. `app.whenReady()` resolves normally first, so the
hang is specifically in the module load.

The trigger appears to be Electron's ESM loader meeting this particular module:
`sdk.mjs` is ~1.2MB packed into ~141 extremely long lines.

**Fix.** Load it through `createRequire`, which routes the load via Node's CJS
loader (Node 22+ can `require()` an ESM package). Same file, ~100ms:

```ts
// electron/main/sdk.ts
const nodeRequire = createRequire(import.meta.url)
const sdk: typeof AgentSdk = nodeRequire('@anthropic-ai/claude-agent-sdk')
```

Types still come from a type-only import, erased at compile time.
`verbatimModuleSyntax` in tsconfig guarantees that `import type` can't silently
become a runtime import and reintroduce the hang.

**If you touch this:** every SDK access in the codebase goes through
`electron/main/sdk.ts`. Keep it that way — it's the single revert point if a future
Electron or SDK release fixes the ESM path.

---

## `Native CLI binary for <platform>-<arch> not found`

**Cause.** The SDK got inlined into the main bundle. It resolves the `claude` binary
relative to its own package directory, so bundling moves the resolution base.

**Check:**

```bash
npm run build
ls -la dist-electron/main/index.js     # should be ~15KB, not ~1.2MB
grep -c 'from "@anthropic-ai/claude-agent-sdk"' dist-electron/main/index.js
```

**Fix.** The SDK must be external in `vite.config.ts`. Vite 8 bundles with Rolldown,
so the option moved — `EXTERNAL_MAIN_DEPS` is declared under **both**
`rolldownOptions` and `rollupOptions` so it applies either way. It must also stay in
`dependencies` (not `devDependencies`) so electron-builder ships it.

---

## `Connecting to 'ws://localhost:...' violates ... connect-src 'none'`

**Symptom.** In `npm run dev`, the console reports a CSP violation for the Vite HMR
WebSocket. The app loads and works, but hot reload silently never fires.

**Cause.** The production CSP sets `connect-src 'none'` — correct for the packaged
app, since the renderer makes no network requests at all. But Vite's dev server
pushes hot updates over a WebSocket, and React Fast Refresh injects an inline
preamble script, both of which that policy blocks.

**Fix.** The CSP is mode-aware, injected into `index.html` at the `<!--CSP-->`
placeholder by the `cspPlugin` in `vite.config.ts`. Dev additionally allows
`ws://localhost:*` and `'unsafe-inline'` scripts; production stays fully locked
down. Verify both:

```bash
npm run build && grep -o 'content="default-src[^"]*"' dist/index.html   # connect-src 'none'
curl -s http://localhost:5174/ | grep -o 'content="default-src[^"]*"'   # ws://localhost:*
```

If you still see the error, a **stale dev server** from an earlier run is serving
the old HTML — note the port in the message and check it:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep 517
```

Vite increments the port when one is taken (5173 → 5174 → …), so an orphaned server
keeps serving the previous build on the port your app connects to.

---

## A session sits on "Starting…" and shows no messages

**Cause.** The CLI emits **nothing at all** until it receives a first user message —
not even `system/init`. Measured: a new session produced 0 messages in 14s of
silence, and a resumed one 0 messages in 20s. Anything that waits for
`session-init` to consider a tab ready therefore waits forever. Resume additionally
restores the *model's* context but replays nothing to the SDK consumer, so the
transcript stays empty.

**Fix (already implemented).** `SessionRunner.attach()` does the two things the CLI
won't:

- emits `session-attached` + `status: 'idle'` as soon as the subprocess is up, so
  the tab is usable immediately;
- on resume, replays the stored transcript via `getSessionMessages()`, normalized
  through the same path as live messages so tool calls and thinking blocks
  reconstruct.

**Known limitation.** Replayed transcripts reconstruct the *main* thread only.
Subagent output lives in separate per-subagent transcripts (`getSubagentMessages`),
which the hydration path doesn't read yet — so on a resumed session the Task tool
call appears but its subagent lane does not. Live subagent lanes are unaffected.
Replay is also capped at the last `MAX_HISTORY_MESSAGES` (400) messages.

---

## A resumed transcript shows every line twice

Fixed, but worth understanding if you touch `streamBuffers`. Block ids come from
model message ids, which are unique only *within* a session. `streamBuffers` is a
single global store, so two tabs resuming the **same** session produced identical
keys and both appended into one buffer — rendering every line twice.

Keys are namespaced by tab via `bufferKeyFor(tabId, blockId)` in
`src/stores/sessionStore.ts`. Any new call into `streamBuffers` from the store must
use that helper rather than a raw `event.blockId`.

---

## Sessions don't appear in the resume list

The list comes from the SDK's `listSessions()`, reading the same `~/.claude/projects`
store the CLI writes.

- **Empty on a fresh machine** is expected — run `claude` once first.
- **Filtered to "This directory"** only matches sessions whose recorded `cwd` is that
  directory.
- **Field names have shifted across SDK versions.** `toSummary()` in
  `electron/main/ipc/register.ts` reads defensively across several key spellings, so
  a rename costs a missing "2 hours ago" label rather than an empty list. If titles
  or timestamps go missing, add the new key there.

---

## The preload bridge is missing

```
The preload bridge is missing. `window.claudeview` was not exposed
```

The preload script didn't load. It must build to **`dist-electron/preload/index.cjs`**
— CommonJS, `.cjs` extension — and that path must match `webPreferences.preload` in
`electron/main/index.ts`. Rebuild and confirm the file exists.

---

## Output looks jumpy or laggy

Tune `DRAIN_WINDOW_MS` in `src/lib/streamBuffers.ts` (default 220ms). Lower for less
lag, higher for more smoothing. See [streaming.md](streaming.md#tuning) for the full
set of dials.

If output arrives in visible clumps despite tuning, confirm batching is working —
add a temporary log in `EventBatcher.flush()` and check that a turn produces a
handful of batches, not hundreds.

---

## A closed tab left a `claude` process behind

```bash
pgrep -fl claude | grep -v Claude.app
```

Some teardown path bypassed `SessionRunner.dispose()`. Any new route that removes a
session must call it rather than just dropping the registry entry — see
[lifecycle-and-cleanup.md](lifecycle-and-cleanup.md).

---

## Permission prompts never appear

By design. The default mode is `auto`, which routes decisions through a model
classifier rather than prompting. Interactive approval requires a `canUseTool`
handler wired through IPC to a UI dialog — not currently implemented; `default`
("Ask") mode has no renderer-side prompt yet. Until then, `plan` mode is the safe
choice for untrusted work.

---

## Typecheck fails with `Option 'baseUrl' has been removed`

TypeScript 7 removed `baseUrl`. Path aliases must be relative to `tsconfig.json`:

```jsonc
"paths": { "@/*": ["./src/*"], "@shared/*": ["./shared/*"] }   // note the ./
```
