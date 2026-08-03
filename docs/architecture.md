# Architecture

## Process model

Electron gives us three contexts. What runs where is forced by two constraints: the
Agent SDK needs Node, and the renderer displays untrusted model output.

| Process | Runs | Holds |
| --- | --- | --- |
| **Main** (Node) | `electron/main/` | The Agent SDK, all `claude` subprocesses, the session registry |
| **Preload** (bridge) | `electron/preload/` | Nine named IPC functions, nothing else |
| **Renderer** (browser) | `src/` | React UI. No Node, no network, no direct IPC |

The SDK lives in main because it spawns subprocesses and touches the filesystem —
capabilities we deliberately withhold from the renderer.

## Module layout

```
shared/
  ipc.ts                    Contract imported by both sides, owned by neither

electron/main/
  index.ts                  App lifecycle, window creation, shutdown
  sdk.ts                    SDK loader (see "The require() workaround")
  ipc/register.ts           Typed ipcMain handlers
  session/
    SessionManager.ts       Registry: tabId -> SessionRunner
    SessionRunner.ts        One query() == one session == one subprocess
    AsyncMessageQueue.ts    Push-based async iterable for streaming input
    MessageNormalizer.ts    SDKMessage -> StreamEvent
    EventBatcher.ts         Coalesce events to <=1 IPC message per frame

electron/preload/index.ts   contextBridge surface

src/
  lib/streamBuffers.ts      In-flight characters + rAF reveal loop
  lib/markdown.ts           Split-parse markdown, sanitization, highlighting
  lib/theme.ts              Colorways, typography, applyAppearance()
  stores/sessionStore.ts    Conversation structure, tab lifecycle
  stores/appearanceStore.ts Persisted appearance settings
  hooks/                    IPC bridge, buffer subscription, sticky scroll
  components/               UI
```

## Data flow

**Outbound** (user sends a message):

```
Composer -> sessionStore.send -> preload -> ipcMain 'session:send'
  -> SessionRunner.send -> AsyncMessageQueue.push -> query()'s prompt iterator
```

**Inbound** (model responds):

```
query() yields SDKMessage
  -> MessageNormalizer  (~35 variants -> a closed union of 12)
  -> EventBatcher       (coalesce runs of deltas; flush per frame)
  -> webContents.send   (one message per frame, not per token)
  -> useStreamBridge    (ONE listener for the whole app)
  -> sessionStore.applyEvents
       ├── structure  -> React state       (tool calls, lanes, ordering)
       └── characters -> streamBuffers     (outside React entirely)
```

## Three decisions worth knowing

### 1. Normalize in main, not in the renderer

`SDKMessage` is a union of ~35 variants, most of them harness bookkeeping — hook
lifecycle, rate-limit telemetry, plugin installs, worker teardown. Forwarding it
verbatim would make every component pattern-match against SDK internals and break
the UI whenever the SDK adds a variant.

`MessageNormalizer` collapses it to 12 UI-meaningful events. Supporting a new SDK
feature means editing one file, not the component tree.

### 2. Key sessions by tab id, not session id

They are different things. A **tab id** is a UI handle the renderer mints. A
**session id** is assigned by the SDK and identifies the conversation on disk.

Keying the registry by tab id means a tab can exist before its session id is known
(still starting) and can outlive one session id (resume, fork) without the registry
losing track of which subprocess belongs to which tab.

### 3. Structure in React, characters outside it

`sessionStore` holds the shape of the conversation. `streamBuffers` holds the text
currently streaming. Text updates dozens of times per second; structure changes only
when a block, tool call, or turn begins or ends.

If text lived in the store, every delta would produce a new store snapshot, and every
`useStore` selector in the app would re-evaluate 60 times a second. Keeping it out
means a frame tick re-renders exactly one leaf component.

## The `require()` workaround

`electron/main/sdk.ts` loads the SDK through `createRequire` rather than a static
ESM import. This is not stylistic — a plain `import` **hangs Electron's main process
forever**. See [troubleshooting.md](troubleshooting.md#the-electron-esm-hang).

Everything else imports the SDK through that one module, so if a future Electron or
SDK release fixes the ESM path, there is exactly one place to revert.

## Build

Three targets, one `vite.config.ts`:

| Target | Entry | Output | Format |
| --- | --- | --- | --- |
| renderer | `src/main.tsx` | `dist/` | ESM |
| main | `electron/main/index.ts` | `dist-electron/main/` | ESM |
| preload | `electron/preload/index.ts` | `dist-electron/preload/index.cjs` | CJS |

The Agent SDK is marked **external** for the main build. It resolves the `claude`
CLI binary relative to its own package directory, so inlining it into the bundle
produces `Native CLI binary not found` at runtime. It stays a real import against
`node_modules` — which is also why it belongs in `dependencies`, so electron-builder
ships it.

Vite 8 bundles with Rolldown, so externals are declared under **both**
`rolldownOptions` and `rollupOptions`; whichever the installed Vite honours, the SDK
stays external. If the main bundle is over ~1MB, externalization silently stopped
working.
