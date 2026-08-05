# Panels and terminals

The window holds up to **8 panels** in a freely rearrangeable split layout. Each
panel is either a Claude **session** or a **terminal**, and each session panel owns
its own composer.

```
┌─ WorkspaceBar ──── add panel · split direction · tidy · settings ──┐
├──────────────────────────┬─────────────────────────────────────────┤
│ ▪ title  ⠿ 12s  · tokens │ ▪ title · cwd     ▪ = accent icon means │
│   transcript             │   xterm + PTY         this panel is     │
│   ─────────────────────  │                       focused           │
│   [auto] 📎 message…  ↑  │   (keystrokes go straight to the shell) │
└──────────────────────────┴─────────────────────────────────────────┘
```

Nothing sits at the bottom of the *window*. Input and status live inside the panels
that own them.

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

The same suite covers attachment composition, the chip row, and the error row, for a
different reason: the paths that *produce* them can't be automated. A real dropped
path needs a real drop, and a session dying mid-conversation can't be summoned on
demand — which is exactly why the error path is worth pinning down rather than
finding out about in the moment. Those components are rendered directly instead.

```
55 passed, 0 failed
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

## Input lives in the panel

Each session panel has its own composer; terminals take keystrokes directly. There
is no window-level input.

This started as one shared bar at the bottom that retargeted as focus moved, with a
status strip beside it. The strip only existed for sessions, so **focusing a
terminal removed a row and shifted every panel** — visible jitter on every focus
change. Moving input into the panels removed the retargeting *and* the jitter,
because now nothing at the window level changes when focus moves. Panel rectangles
are byte-identical with a session focused and with a terminal focused.

Per-session status went with it: model and token totals are in the panel header,
and permission mode sits in the composer row — it governs what the agent may do to
your machine, so it belongs where you commit an instruction.

### Understated on purpose

With up to eight composers on screen, each in a fraction of the window, the
window-bar treatment — full-width bordered shell, solid accent send button, two
lines of keyboard hints — would tile into eight competing focal points.

So each composer is a quiet filled row: no border at rest, no hint text, and a send
button that only appears once there's something to send. The focused panel's header
icon already says which one is live; the composer only lifts slightly rather than
announcing itself again.

### Width follows the panel, not the window

Once you can split eight ways, the window's width says nothing about how much room
a given composer has. So the gutters are `@container` queries against the **panel**:

| Panel width | Gutter |
| --- | --- |
| < 30rem | 12px |
| 30–48rem | 20px |
| ≥ 48rem | 32px |

The transcript uses the same three values, and both cap at the same
`measure + 8rem` box — so the composer shell lines up under the prose at every
density, and its right edge lines up with the user bubbles and tool rows above it.

**The nesting order is load-bearing.** Padding applied *outside* the width cap
offsets the composer from the prose by exactly the gutter width. Measured before the
fix: prose at x=268, composer shell at x=236. Cap first, gutter inside.

## Attachments

Drop files or folders onto a composer, or click the paperclip (`⌥`-click for
folders — macOS won't offer files and folders in one dialog without the selection
rules going ambiguous).

Attachments are sent as **paths, not contents**. The agent already has file tools
and a permission model, so a path lets it read exactly what it needs, when it needs
it. Inlining bytes would blow up the turn on a large file, make a folder attachment
meaningless, and route the read around the permission mode chosen in that same
composer row.

A dropped `File` no longer carries `.path` — Electron removed it in v32 so a
compromised renderer can't read arbitrary disk locations out of a drop. The path is
requested explicitly from the preload bridge via `webUtils.getPathForFile`, which is
the point: the renderer gets paths only for files the user physically dropped.

Dragging *text* rather than a file inserts it into the message instead — a path
copied from a terminal isn't a file reference.

A stray drop that misses a composer is swallowed at the window level. A browser's
default response to a dropped file is to navigate to it, which in Electron replaces
the whole app — every live session and terminal gone, with no way back but a
relaunch.

## Activity

The moment you press Enter, three things happen in the same frame: your message
appears, the composer switches to "Queue a follow-up…", and the indicator starts —
**13ms**, measured. None of it waits for the model, or even for the main process.

The labelled indicator sits at the **tail of the transcript**, where your eye
already is after sending. The panel header carries a silent glyph for the panels
you're *not* looking at. It shows what the agent is doing and how long it's been
doing it:

| Phase | Glyph |
| --- | --- |
| Thinking / starting | a slow breathing dot |
| Writing | a left-to-right wave |
| Running a tool | a rotating arc |

A long turn is indistinguishable from a hung one if nothing moves, which is why the
terminal client shows a spinner and a clock. Shape and motion carry the phase, not
colour — the whole indicator is one accent hue. Narrow panels keep the glyph and
drop the word and the clock.

All three animate `transform` and `opacity` only, so they stay on the compositor and
never trigger layout — they run continuously, in up to eight panels, beside a
transcript already being repainted every frame.

### Failures

Errors are **transcript items**, not a strip above the composer. They sit where they
happened, in order, and a send that failed keeps its text so it can be resent with
one click. A strip lost both facts: which message failed, and every error but the
last.

A retry button appears only when resending would actually help. A session that died
can't be fixed by sending the same message again, so that case offers Reconnect
instead — offering a button that can't work just costs a second failure to find out.

## Focus

Exactly one panel is focused. It's marked by the **panel's own type icon, top left
of its header, in the accent colour** — the only thing in any header that changes
colour.

This used to be an accent ring around the whole panel. At eight panels that ring is
a large bright rectangle competing with the content inside it, and it only ever says
one bit. Colour isn't the sole carrier: the focused panel's title also sits at full
contrast while the rest stay muted.

| Action | |
| --- | --- |
| Click a panel | Focus it |
| `Alt+Tab` / `Ctrl+Tab` | Next panel (add `Shift` for previous) |
| `⌘1`–`⌘9` | Focus by position |

**Keyboard focus moves the caret into the panel's input; pointer focus does not.**
Clicking into a transcript to select text would otherwise yank the caret away
mid-selection. The store exposes this as `focusPanel(id, viaKeyboard)`, which bumps
an `autoFocusToken` the panels watch — a counter rather than a boolean, so switching
back to the same panel re-focuses instead of being a no-op.

Cycling follows **visual order** from the layout tree, not creation order, so
`Alt+Tab` moves the way the panels look arranged.

For interactive programs (`vim`, `htop`, a REPL) type **directly into the terminal
panel** — its composer-free by design, and those need raw keystrokes.

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
| `Alt+Tab` / `Ctrl+Tab` | Cycle panels (`Shift` reverses) |
| `Enter` | Send (in a session composer) |
| `Esc` | Interrupt the focused session's turn |
| Paperclip / `⌥`-click | Attach files / folders |
| `⌘,` | Appearance |

Rearranging is drag-only for now — there are no keyboard commands for moving a panel
or resizing a split.
