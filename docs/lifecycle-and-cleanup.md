# Lifecycle and cleanup

Every live session is an **OS subprocess**. Getting teardown wrong here doesn't cost
a few kilobytes of JS heap — it strands a `claude` process per closed tab. That is
why cleanup gets its own document.

## The three-step teardown

Every exit path funnels into `SessionRunner.dispose()`, which always runs the same
three steps **in this order**:

```ts
this.queue.close()                                    // 1
if (!this.abort.signal.aborted) this.abort.abort()    // 2
this.batcher.dispose()                                // 3
```

1. **Close the input queue first.** `query()` is parked pulling from an async
   iterable. Closing it resolves the parked consumer with `done: true`, letting the
   iterator return and the SDK shut the subprocess down *gracefully*. Skip this and
   the subprocess has no reason to exit.
2. **Then abort.** Interrupts anything still in flight. Doing this before step 1
   would abort mid-turn rather than letting the stream close cleanly.
3. **Drop the emit path last.** After this, no event can be posted toward a
   WebContents that may already be destroyed.

`dispose()` then awaits the consume loop — so a resolved `dispose()` means the
subprocess is really gone — but races it against a 2s timeout so a wedged child can
never hang app shutdown.

Verified: `disposeAll()` returns in ~300–600ms with `manager.size === 0` and no
orphaned `claude` processes.

## Every path that reaches it

| Trigger | Path |
| --- | --- |
| User closes a tab | `sessionStore.closeTab` → `session:close` → `SessionManager.close` |
| Tab's session replaced (resume/fork) | `SessionManager.create` disposes the old runner first |
| Window closed | `window.on('closed')` → `disposeAll()` |
| App quitting | `before-quit` preventDefault → `disposeAll()` → `app.quit()` |
| Stream ends naturally | `consume()`'s `finally` → `finalize()` |
| SDK throws | same `finally` |

Two subtleties:

- **`SessionManager.create` disposes before creating.** Without it, a double-create
  on the same tab id overwrites the map entry and orphans the first subprocess with
  no remaining reference to shut it down.
- **`SessionManager.close` deletes from the map *before* awaiting disposal.**
  Disposal is async; leaving the entry in place would let a concurrent `create()`
  find a dying runner.
- **Cleanup on `window.on('closed')`, not only `before-quit`.** On macOS a window
  can close while the app keeps running. Waiting for quit would strand every
  session with no UI left to manage it.

## Renderer-side leaks

These are less dramatic than a stranded process but matter in a window that stays
open for hours.

**IPC listeners.** `useStreamBridge` is mounted **once**, at the app root, and
dispatches by `tabId`. Subscribing per-tab or per-component would add an
`ipcRenderer.on` listener per mount; Electron warns at 10 and the rest pile up
silently. The hook returns preload's unsubscribe from its effect, which also handles
StrictMode's double-invoked effects in development.

**Stream buffers.** `streamBuffers` holds the full text of every block. Three
release points:

| When | Where |
| --- | --- |
| Tab closed | `closeTab` collects every block id in the tab and calls `release()` |
| Lane exceeds 1200 items | `trimLane` releases the trimmed items' buffers |
| Last subscriber unsubscribes | The empty listener `Set` is deleted, not left behind |

That last one is the easy miss: keeping an empty `Set` per block id is a slow leak
of one Map entry per block, forever.

**Observers and timers.** `useStickyScroll` disconnects its `ResizeObserver` and
removes its scroll listener on unmount. `EventBatcher.dispose()` clears its pending
timer. The rAF loop in `streamBuffers` is only scheduled while backlog exists and
stops on its own.

**Unbounded transcripts.** `MAX_ITEMS_PER_LANE` (1200) trims the oldest items and
releases their buffers, so a multi-hour session doesn't grow without bound.

## Bounding IPC payloads

`MessageNormalizer.PREVIEW_LIMIT` (2000 chars) truncates tool inputs and results
before they cross IPC. A `Read` of a large file or a verbose `Bash` result can be
megabytes; the UI shows a preview and notes how much was omitted.

## Checking for leaks

```bash
# Should list only your own interactive sessions
pgrep -fl claude | grep -v Claude.app

# Renderer: watch for growth while idle
# DevTools -> Memory -> take heap snapshots and compare
```

If a closed tab leaves a `claude` process behind, the failure is almost certainly a
path that bypassed `dispose()` — check that any new teardown route calls it rather
than just dropping the map entry.
