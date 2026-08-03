# ClaudeView

A desktop UI for [Claude Code](https://claude.com/claude-code). It runs the Claude
Agent SDK inside Electron's main process, keeps one long-lived session per tab, and
renders the message stream as smooth, readable markdown.

Built for reading agent output outside an IDE, when the terminal is the wrong shape
for the job.

<!-- Screenshot: docs/images/screenshot.png -->

## What it does

- **Real sessions, not one-shot calls.** Each tab holds one long-lived `claude`
  subprocess fed by a streaming-input queue, so a conversation is a conversation —
  not a new process per message.
- **Smooth streaming.** Token arrival is decoupled from token display, so bursty
  output reads as steady prose instead of lurching. See
  [docs/streaming.md](docs/streaming.md).
- **Tabs.** Multiple concurrent sessions, each with its own working directory,
  status, and cost. `⌘T` / `⌘W` / `⌘1-9`.
- **Subagent views.** Subagents get their own transcript lanes instead of being
  interleaved into one unreadable stream.
- **Resume anything.** Sessions started here *or in the terminal* are listed and
  resumable — they share the same on-disk store.
- **Adjustable appearance.** Five colorways, four typefaces, and live control over
  text size, line height, and line width. `⌘,`
- **Auto permission mode by default**, changeable per session from the status bar.

## Requirements

- Node.js 20+ (developed on 24)
- An authenticated Claude Code CLI — run `claude` once and log in. ClaudeView uses
  the same credentials and the same `~/.claude` settings, `CLAUDE.md`, and skills.
- macOS, Linux, or Windows (developed and verified on macOS)

## Getting started

```bash
git clone https://github.com/rpw1134/claudeview.git
cd claudeview
npm install
npm run dev
```

| Script            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Vite dev server + Electron with hot reload          |
| `npm run build`   | Typecheck, then build renderer, main, and preload   |
| `npm run typecheck` | Types only                                        |
| `npm run dist`    | Build and package a distributable via electron-builder |

## Keyboard shortcuts

| Shortcut       | Action                     |
| -------------- | -------------------------- |
| `Enter`        | Send message               |
| `Shift+Enter`  | Newline                    |
| `Esc`          | Stop the current turn      |
| `⌘T` / `Ctrl+T`| New session                |
| `⌘W` / `Ctrl+W`| Close session              |
| `⌘1`–`⌘9`      | Jump to tab                |
| `⌘,`           | Appearance settings        |

## How it fits together

```
┌─────────────────────────── Electron main (Node) ───────────────────────────┐
│  SessionManager           registry: tabId -> SessionRunner                 │
│    └── SessionRunner      one query() == one CLI subprocess                │
│          ├── AsyncMessageQueue   streaming input (keeps the session alive) │
│          ├── MessageNormalizer   SDKMessage (~35 variants) -> StreamEvent  │
│          └── EventBatcher        coalesce to <=1 IPC message per frame     │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │  contextIsolated preload bridge
┌───────────────────────────────────▼────────────────────────────────────────┐
│  Renderer (React)                                                          │
│    sessionStore     conversation *structure* (tabs, lanes, tool calls)     │
│    streamBuffers    in-flight *characters*, revealed on a rAF loop         │
│    StreamingMarkdown  split-parse: settled prefix memoized, tail per-frame │
└────────────────────────────────────────────────────────────────────────────┘
```

The key idea is that split at the bottom: React state holds the *structure* of the
conversation, while streaming text lives outside React entirely. That is what keeps
a thousand-message transcript rendering as smoothly as an empty one.

## Documentation

| Document | Contents |
| --- | --- |
| [architecture.md](docs/architecture.md) | Process model, module layout, data flow |
| [streaming.md](docs/streaming.md) | How smooth output is achieved, end to end |
| [ipc-contract.md](docs/ipc-contract.md) | Channels, event union, adding an event |
| [lifecycle-and-cleanup.md](docs/lifecycle-and-cleanup.md) | Every teardown path and why it exists |
| [theming.md](docs/theming.md) | Colorways, typography, adding a colorway |
| [troubleshooting.md](docs/troubleshooting.md) | Known issues, including the Electron ESM hang |

## Security posture

The renderer displays model-authored markdown as HTML, so it is treated as
untrusted:

- `contextIsolation: true`, `nodeIntegration: false` — no Node in the renderer.
- The preload bridge exposes nine named functions, not a generic `invoke(channel)`.
- All markdown is sanitized with DOMPurify before rendering.
- A strict CSP with `connect-src 'none'` in production — the renderer makes no
  network requests. (Dev additionally allows `ws://localhost:*` for Vite HMR; see
  `cspPlugin` in `vite.config.ts`.)
- Links open in the system browser; in-app navigation is denied.

Note that the agent itself still runs with whatever permissions its mode allows.
`auto` is the default; `bypassPermissions` does what it says.

## License

MIT
