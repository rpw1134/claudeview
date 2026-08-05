# IPC contract

Everything crossing the process boundary is declared in **`shared/ipc.ts`**, which
both sides import and neither owns. It must stay dependency-free and type-only at
runtime — importing the Agent SDK there would drag Node-only code into the renderer.

## Two directions

**Renderer → main** is request/response, declared in `IpcCalls` as
`channel: [request, response]`:

| Channel | Request | Response |
| --- | --- | --- |
| `session:create` | `CreateSessionRequest` | `{ok:true} \| {ok:false,error}` |
| `session:send` | `{tabId, text}` | `void` |
| `session:interrupt` | `{tabId}` | `void` |
| `session:set-permission-mode` | `{tabId, mode}` | `void` |
| `session:set-model` | `{tabId, model?}` | `void` |
| `session:close` | `{tabId}` | `void` |
| `sessions:list` | `{cwd?, limit?}` | `SessionSummary[]` |
| `app:pick-directory` | — | `string \| null` |
| `app:pick-attachments` | `{directories?}` | `string[]` |
| `app:info` | — | `{cwd, version, home}` |

`session:send` carries a **`turnId`** and returns `{ok, error?}`. Both exist because
the renderer echoes the message optimistically: the id lets main's echo be dropped
instead of rendered twice, and the result lets a rejected send be turned back into a
visible, retryable failure rather than a message that silently never happened.

`SessionStatus` describes the **turn**, not the session lifecycle. It deliberately
has no `'ready'` — see
[troubleshooting](troubleshooting.md#nothing-happens-for-a-second-after-pressing-enter)
for what sharing one field between the two axes cost.

The bridge also exposes one **synchronous** function, `resolveDroppedPaths(files)`.
It wraps `webUtils.getPathForFile`, which lives in the Electron module the renderer
must never hold; handing back only the resolved strings keeps the capability behind
the bridge. It's the only way to learn a dropped file's path since Electron 32
removed `File.path`.

**Main → renderer** is a single push channel, `session:event`, carrying
`StreamEnvelope`:

```ts
type StreamEnvelope = { tabId: string; events: StreamEvent[] }
```

Note `events`, plural — see [streaming.md](streaming.md#layer-1--batching-main-process)
for why batching is mandatory rather than an optimization.

## Type safety across the boundary

Three mechanisms keep the two sides from drifting:

1. **`Api` is derived from `IpcCalls`** with a mapped type, so the preload bridge
   cannot expose a function whose signature disagrees with the contract.
2. **`handle()` in `register.ts`** binds each channel name to its request/response
   types, so a handler that drifts fails to compile rather than returning
   `undefined` at runtime.
3. **`PermissionMode` is structurally asserted** against the SDK's own type in
   `SessionRunner.ts`. `shared/ipc.ts` can't import the SDK, so this is where the
   hand-written union is reconciled — if the SDK adds a mode, that assertion fails
   to typecheck.

## The `StreamEvent` union

Twelve variants, closed. Ordered roughly by how hot the path is.

| Event | Purpose |
| --- | --- |
| `text-delta` | Model text. The hot path — deliberately the smallest shape possible |
| `thinking-delta` | Extended thinking, separate so the UI can collapse it |
| `block-end` | Content block complete; the renderer stops its typewriter drain |
| `session-init` | Session id, model, cwd, permission mode, tools. Once per session |
| `status` | Turn activity, driving the activity indicator |
| `tool-start` / `tool-end` | Tool call lifecycle. Payloads pre-truncated in main |
| `agent-start` / `agent-end` | A subagent lane opened / closed |
| `user-message` | Echo of a user turn, so the transcript owns the conversation |
| `result` | Turn finished; carries cost, duration, turn count |
| `error` | Something failed |

Every transcript-bearing event carries an `AgentRef` — `{id: 'main'}` or
`{id: <parent_tool_use_id>, type: 'Explore'}`. That is what routes output into
per-subagent lanes instead of interleaving it.

## Security boundary

The preload exposes **nine named functions**, not a generic
`invoke(channel, payload)`. The renderer displays model-authored markdown as HTML;
if a rendering escape ever occurred, a generic invoke would hand it arbitrary IPC.
Named functions cap the blast radius at these nine operations.

The `IpcRendererEvent` is deliberately not forwarded to handlers — it carries
`sender`, a capability the bridge exists to withhold.

## Adding an event

1. Add the variant to `StreamEvent` in `shared/ipc.ts`.
2. Emit it from `MessageNormalizer.normalize()`.
3. If it's high-frequency, add a coalescing rule in `EventBatcher.coalesce()`.
4. Handle it in `reduceTab()` in `src/stores/sessionStore.ts`.

The switch in `reduceTab` is exhaustive over the union, so TypeScript will point at
step 4 if you forget it.

## Adding a call

1. Add `'channel': [Request, Response]` to `IpcCalls`.
2. Add a `handle('channel', ...)` in `electron/main/ipc/register.ts` **and** the
   channel name to the `unregisterIpc` list.
3. Add the passthrough in `electron/preload/index.ts`.

`Api` is derived from `IpcCalls`, so omitting step 3 is a compile error.
