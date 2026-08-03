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

## The layout is a split tree

Arrangement lives in a binary tree of splits (`src/lib/layoutTree.ts`), not a fixed
set of presets:

```
split(row, 0.5)
├── leaf(session)
└── split(column, 0.6)
    ├── leaf(terminal)
    └── leaf(terminal)
```

Every split divides 100% of its parent, so the layout **always fills the viewport
exactly** — no gaps, no overlap, whatever you drag it into. Presets could only offer
the shapes someone predicted in advance.

Every operation (`insertPanel`, `removePanel`, `movePanel`, `swapPanels`,
`setRatio`) is **pure** and returns a new tree. Layout edits happen several times a
second during a drag, so in-place mutation would make React miss updates and make an
undo stack impossible to add later.

Removing a panel **collapses its split** so the sibling takes the parent's place.
Without that the tree accumulates splits with one empty side and the survivor
renders at half size with dead space beside it.

### Invariants are tested

`npm test` checks the tree directly — the logic is pure, which is the point of
keeping it out of the components. The load-bearing assertion is **coverage**: after
any sequence of inserts, removes and moves, panel areas sum to exactly 1.

```
29 passed, 0 failed
```

## Rearranging

**Drag a panel by its header.** The whole panel isn't draggable — that would fight
selecting transcript text, clicking a tool call, and typing in a terminal — so the
grab affordance is confined to the header strip.

Drop zones, previewed with a translucent overlay before you commit:

| Where you drop | Result |
| --- | --- |
| Outer third, any edge | Splits that panel on that side |
| Middle | Swaps the two panels |

**Drag a divider** to resize. The ratio is written straight to the DOM during the
drag and only committed to the store on release — routing every pointer move through
React state would re-render both subtrees, including live transcripts and terminal
emulators, at pointer frequency.

Ratios clamp to 12%/88% so a pane can't be dragged down to an unusable sliver, and
the toolbar's grid button evens everything out again.

### Why pointer events, not HTML5 drag-and-drop

HTML5 DnD gives a browser-drawn ghost you can't style, coarse `dragover` throttling,
and unreliable coordinates over nested children. Panels need a precise indicator
that tracks the cursor across nested containers, so a pointer-down on the header
captures the pointer and each move hit-tests via `elementFromPoint`.

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

## Three behaviours worth knowing

**The mosaic root must be a flex container.** The tree's root child sizes itself
with `flex-1`, which does nothing inside a plain block — the layout then takes
*content* height and leaves dead space below the panels. Measured coverage was 0.776
before the fix and 0.954 after, the remainder being the 8px container padding and
the dividers.


**Terminal creation is idempotent.** A panel's id *is* its terminal's identity, and
the component remounts more often than you'd expect — StrictMode double-invokes
effects, and hot updates do the same. An earlier version killed and respawned the
PTY on the second call, which produced a spurious `[process exited with code 0]`,
two emulators writing to one PTY, and interleaved keystrokes (`c aecho ...`).
`create()` now returns early when a live terminal already exists.

**Scrollback survives layout changes, without duplicating.** Changing the layout
unmounts and remounts panels, and a fresh xterm starts blank. Main retains ~200KB
per terminal and the panel replays it on mount.

The subtlety: a mounting panel subscribes to live output *and* replays the buffer,
so anything produced between spawn and replay lands twice — the shell's greeting
appearing twice was the visible symptom. `terminal:snapshot` therefore returns the
scrollback *and* the sequence number it covers, and the panel drops live events at
or below it. Same idempotence pattern as session events.

The PTY deliberately outlives the component — only closing the panel ends it.

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

Rearranging is drag-only for now — there are no keyboard commands for moving a panel
or resizing a split.
| `⌘,` | Appearance |
