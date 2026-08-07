# Panels and terminals

The window holds up to **8 panels** in a freely rearrangeable split layout. Each
panel is either a Claude **session** or a **terminal**, and each session panel owns
its own composer.

```
                                   ⊞ ⊟ │ ◫ ⊟ ⊞ │ ⚙   ← toolbar: no fill, flush right
┌──────────────────────────┬─────────────────────────────────────────┐
│ ▪ title  ✳ 12s  · tokens │ ▪ title · cwd     ▪ = accent icon means │
│   transcript, full width │   xterm + PTY         this panel is     │
│                          │                       focused           │
│   message…               │   (keystrokes go straight to the shell) │
│              [auto] 📎 ↑ │                                         │
└──────────────────────────┴─────────────────────────────────────────┘
```

Nothing sits at the bottom of the *window*, and the toolbar has no fill — input and
status live inside the panels that own them, and the panel header is the only
labelled band on screen.

## Why the toolbar is flush right

Its controls used to start on the left, which on macOS means starting **after the
traffic lights** — 84px in, while panel content below begins at 48px (the mosaic's
8px padding plus a panel's 40px gutter). No tuning fixes that: the OS owns the
top-left corner and nothing can share it.

So nothing tries. The left is empty drag region, the controls sit against the right
edge on the same vertical line as the content beneath them (measured: last control,
prose and composer all end at x=1232), and there's no left-aligned chrome left to
be misaligned.

Dropping the toolbar's fill mattered as much. Two stacked filled bands — toolbar,
then panel header — put two claims on the same piece of hierarchy before any content
appeared. Without it there is one labelled strip, and the toolbar reads as floating
controls rather than a second title bar.

The icons are all one size, matching the split controls. Text labels there competed
with panel titles directly below them at similar weight, for actions that have
shortcuts the home screen teaches on first run.

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
62 passed, 0 failed
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
| < 30rem | 16px |
| 30–48rem | 28px |
| ≥ 48rem | 40px |

The transcript, lane tabs and reconnect row use the same three values, and the
toolbar's right gutter is the widest of them plus the mosaic's own 8px padding — so
its last control lands on the same vertical line as the content below it.

Nothing is width-capped any more. `--measure` defaults to `none`, and Settings ▸
Line width reins prose back in if you want it; the top of that slider is "full
width".

### Controls on one side

The composer is two rows: the message across the full width, then every control on
the right — permission mode, attach, send. They used to be interleaved with the
text, so the input started a third of the way across and the eye stepped over two
widgets to reach the thing it was there to use.

Permission mode is a real menu rather than a native `<select>`, because "Bypass" and
"Don't ask" mean nothing until something says what they permit. Each option carries a
one-line description, and picking either of the two that let the agent act without
prompting turns the chip warning-coloured with a shield.

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
appears, the composer switches to "Add to the pile…", and the indicator starts —
**13ms**, measured. None of it waits for the model, or even for the main process.

The labelled indicator sits at the **tail of the transcript**, where your eye
already is after sending. The panel header carries a silent glyph for the panels
you're *not* looking at. It shows what the agent is doing and how long it's been
doing it:

| Phase | Glyph |
| --- | --- |
| Thinking / starting | the mark breathes |
| Writing | its arms ripple outward in sequence |
| Running a tool | it rotates |

Elapsed time reads `12s` below a minute and `1m 05s` above it — `90s` is arithmetic
the reader has to do.

A long turn is indistinguishable from a hung one if nothing moves, which is why the
terminal client shows a spinner and a clock. Shape and motion carry the phase, not
colour — the whole indicator is one accent hue. Narrow panels keep the glyph and
drop the word and the clock.

All three animate `transform` and `opacity` only, so they stay on the compositor and
never trigger layout — they run continuously, in up to eight panels, beside a
transcript already being repainted every frame.

### Drafts belong to the session

The composer's unsent text lives on the **tab**, not in the component. A composer
unmounts whenever the layout tree changes shape — opening a panel wraps its sibling
in a new split, remounting that subtree — and component state took a half-written
message down with it. Losing what someone typed is a data-loss bug however small the
component holding it.

### Success is silent

Tool rows only mark *failures*. A tick on every successful call produced a column of
identical glyphs down the right edge, each one needing a look to discover it said
nothing. A failure tints the whole row and turns its name red, because that's
something you want to catch while scrolling past — a 13px icon at the far margin
isn't.

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
| `⌥1`–`⌥8` | Focus by visual position (left-to-right, top-to-bottom) |
| `⌘1`–`⌘9` | Focus by creation order |

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
| `⌘T` / `⌥T` | New session (thread) panel |
| `⇧⌘T` / `⌥C` | New terminal (console) panel |
| `⌥A` | Split focused panel vertically (new panel to the right, same kind) |
| `⌥S` | Split focused panel horizontally (new panel below, same kind) |
| `⌘W` | Close focused panel |
| `⌥1`–`⌥8` | Focus panel by visual position |
| `⌘1`–`⌘9` | Focus panel by creation order |
| `Alt+Tab` / `Ctrl+Tab` | Cycle panels (`Shift` reverses) |
| `Enter` | Send (in a session composer) |
| `Esc` | Interrupt the focused session's turn |
| Paperclip / `⌥`-click | Attach files / folders |
| `⌘,` | Appearance |

Rearranging is drag-only for now — there are no keyboard commands for moving a panel
or resizing a split.
