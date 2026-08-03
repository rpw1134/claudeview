# Streaming

How output gets from the model to the screen without lurching.

## The problem

Model output does not arrive at a constant rate. A turn looks like this:

```
  t=0ms     nothing (request in flight)
  t=340ms   ████████ 8 deltas in one tick
  t=352ms   ██ 2 deltas
  t=1200ms  nothing (tool call running)
  t=2100ms  ████████████ 12 deltas
```

Render each delta the instant it lands and you faithfully reproduce that jitter.
Text appears in clumps, pauses, clumps again. It is legible but unpleasant to watch
— and it is exactly what makes raw terminal streaming tiring to read.

There are four separate mechanisms here, at four different layers. Each solves a
distinct part of the problem.

---

## Layer 1 — Batching (main process)

`electron/main/session/EventBatcher.ts`

A fast turn emits text deltas faster than one per millisecond. Sending each as its
own IPC message means thousands of `webContents.send()` calls, each with its own
structured-clone serialization and its own renderer task.

That is not just wasteful, it is **counterproductive**: it saturates the renderer's
event loop and produces choppier output than batching does. Pushing harder makes
the UI slower.

The batcher flushes on whichever comes first:

- a ~16ms timer (one frame — latency stays imperceptible), or
- a 512-event cap (so a burst cannot grow the queue without bound).

On flush it **coalesces**: adjacent deltas for the same block merge into one event,
and runs of status events collapse to the last one. Measured on a real turn: 16
events delivered in 6 batches; on a subagent run, 31 events in 14 batches.

## Layer 2 — Reveal pacing (renderer)

`src/lib/streamBuffers.ts`

This is the layer that actually makes it *smooth*. Every block carries two cursors:

```
full   — everything received      (grows in bursts, from IPC)
shown  — everything displayed     (advances once per frame, evenly)
```

A single `requestAnimationFrame` loop walks `shown` toward `full`. The step size is
recomputed every frame from the live backlog:

```ts
const framesInWindow = DRAIN_WINDOW_MS / FRAME_MS   // 220 / 16
const step = Math.max(2, Math.ceil(backlog / framesInWindow))
```

Because the rate is derived from the *current* backlog, a burst raises the reveal
speed rather than queueing behind a fixed rate. Text still finishes when the model
finishes — this adds smoothing, not lag.

Two escape hatches keep it honest:

- **`INSTANT_THRESHOLD` (4000 chars).** Above this we stop pacing and jump. Hit when
  resuming a session or on a huge burst; nobody wants to watch 40KB typewriter in.
- **`finish()` does not truncate.** Marking a block complete lets the remaining
  backlog animate out, so the tail is never cut off by end-of-stream.

The loop is only scheduled while work exists, so an idle app schedules no frames.

## Layer 3 — Staying out of React's way

`src/hooks/useStreamedText.ts`

`streamBuffers` is a plain observable keyed by block id, not a React store. Only the
component displaying an actively streaming block subscribes, via
`useSyncExternalStore`.

That hook rather than `useState` + effect, for two reasons: it subscribes during
render (so no delta slips through the gap before effects commit), and it carries
React's tearing guarantees under concurrent rendering.

Net effect: a frame tick re-renders exactly one leaf component. The transcript above
it — potentially thousands of nodes — is untouched. This is why a long session
streams as smoothly as a fresh one.

## Layer 4 — Split-parse markdown

`src/lib/markdown.ts`, `src/components/StreamingMarkdown.tsx`

Re-parsing an entire 8KB response every frame gets worse as the response grows —
backwards, since the end of a long answer is where smoothness matters most.

Markdown block elements are separated by blank lines, so everything before the final
blank line is **settled** and cannot be changed by future tokens:

```
┌─────────────────────────────┐
│ settled prefix              │  parsed once, memoized twice over
│ (before last blank line)    │  (useMemo + module-level cache)
├─────────────────────────────┤
│ in-progress tail            │  re-parsed each frame — but it's short
└─────────────────────────────┘
```

Per-frame cost becomes a function of the current paragraph, not the whole message.

Two details:

- **Unterminated code fences.** A blank line inside a fence is not a block boundary.
  `splitStream` detects an odd number of ``` and treats the whole fence as tail —
  otherwise you get a flash of broken half-parsed code block.
- **Highlighting runs on settled content only.** Re-tokenizing a code block that is
  still being typed spends frame budget on a result that is about to change.

---

## Tuning

| Constant | File | Default | Effect |
| --- | --- | --- | --- |
| `FLUSH_INTERVAL_MS` | `EventBatcher.ts` | 16 | Higher = fewer IPC messages, more latency |
| `MAX_BATCH` | `EventBatcher.ts` | 512 | Burst ceiling before a forced flush |
| `DRAIN_WINDOW_MS` | `streamBuffers.ts` | 220 | **The main smoothness dial.** Higher = smoother and laggier |
| `MIN_CHARS_PER_FRAME` | `streamBuffers.ts` | 2 | Floor, so slow trickles still move |
| `INSTANT_THRESHOLD` | `streamBuffers.ts` | 4000 | Backlog above which pacing is abandoned |

If output feels laggy, lower `DRAIN_WINDOW_MS` first. If it feels jumpy, raise it.

## Accessibility

The typewriter is visual only. A live region updating 60 times a second would make a
screen reader unusable, so `StreamingMarkdown` sets `aria-live="off"` while
streaming and switches to `"polite"` on completion — the finished message is
announced once. `prefers-reduced-motion` disables the caret blink.
