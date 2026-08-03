# Panels and terminals

The window is a grid of up to **8 panels**. Each panel is either a Claude **session**
or a **terminal**, and a single message bar at the bottom targets whichever panel is
focused.

```
┌─ WorkspaceBar ──── add panel · layout picker · settings ───────────┐
├──────────────────────────┬─────────────────────────────────────────┤
│  session panel           │  terminal panel        ← accent ring    │
│  (transcript + lanes)    │  (xterm + PTY)            = focused     │
├──────────────────────────┴─────────────────────────────────────────┤
│  MessageBar — retargets to the focused panel                       │
├────────────────────────────────────────────────────────────────────┤
│  StatusBar — focused session only                                  │
└────────────────────────────────────────────────────────────────────┘
```

## Layouts are presets, not a split tree

A recursive split tree (drag any edge, nest arbitrarily) is more powerful and much
worse to use: every rearrangement becomes pixel-dragging, and layouts drift into
shapes you didn't intend. The presets cover what's actually wanted:

| Preset | Slots | Grid |
| --- | --- | --- |
| Single | 1 | `1fr` |
| Side by side | 2 | `1fr 1fr` |
| Stacked | 2 | one column, two rows |
| Three columns | 3 | `1fr 1fr 1fr` |
| Quadrants | 4 | 2 × 2 |
| Six | 6 | 3 × 2 |
| Eight | 8 | 4 × 2 |

Adding a panel **grows the layout automatically** to the smallest preset that fits,
and closing one shrinks it back. A preset with fewer slots than open panels is
disabled in the picker rather than silently hiding a panel.

## Focus is the load-bearing concept

Exactly one panel is focused. It carries the only accent ring on screen, and the
message bar sends there. Without a single unambiguous focus there'd be no way to
know where a typed message is going — which is the whole risk of a multi-panel
layout with one input.

Click a panel to focus it, or `⌘1`–`⌘9`.

## The message bar retargets

| Focused panel | Behaviour |
| --- | --- |
| Session | Sends a message. Shows session status. `Esc` interrupts the turn. |
| Terminal | Writes the line plus `\r` to the PTY — exactly like typing a command. |

The glyph, the placeholder, and the hint text all change with the target, so you
can tell where input is going without looking at the panel ring.

**Drafts are kept per panel.** Switching panels mid-sentence doesn't discard what
you typed; switching back restores it.

For interactive programs (`vim`, `htop`, a REPL) type **directly into the panel** —
the message bar is line-oriented, and those need raw keystrokes.

## Why a real terminal

`node-pty` provides an actual TTY in the main process; `xterm.js` renders it. That
combination is what makes `vim`, colour output, line editing, and job control work.
Anything less — piping to a `child_process` and printing stdout — renders escape
sequences as garbage and breaks every full-screen program.

**`node-pty` is a native module.** It must be compiled against Electron's ABI:

```bash
npm run rebuild:native     # also runs automatically via postinstall
```

If terminals fail to open with a module-version error, that's the step that's
missing. It's also why `node-pty` is in `dependencies` (shipped) and marked
external in the main build, while `xterm` is a devDependency (bundled into the
renderer).

## Two behaviours worth knowing

**Terminal creation is idempotent.** A panel's id *is* its terminal's identity, and
the component remounts more often than you'd expect — StrictMode double-invokes
effects, and hot updates do the same. An earlier version killed and respawned the
PTY on the second call, which produced a spurious `[process exited with code 0]`,
two emulators writing to one PTY, and interleaved keystrokes (`c aecho ...`).
`create()` now returns early when a live terminal already exists.

**Scrollback survives layout changes.** Changing the layout unmounts and remounts
panels, and a fresh xterm starts blank. Main retains ~200KB of output per terminal
and the panel replays it on mount, so rearranging doesn't appear to wipe your
shells. The PTY itself deliberately outlives the component — only closing the panel
ends it.

## Process lifetime

Terminals are subprocesses and get the same treatment as sessions: closing a panel
kills its shell, and `TerminalManager.disposeAll()` runs on window close and before
quit. A leaked shell is as bad as a leaked `claude` process.

```bash
# after closing panels, should show nothing unexpected
pgrep -fl "zsh|bash" | grep -v login
```

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘T` | New session panel |
| `⇧⌘T` | New terminal panel |
| `⌘W` | Close focused panel |
| `⌘1`–`⌘9` | Focus panel by position |
| `⌘,` | Appearance |
