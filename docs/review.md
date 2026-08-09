# Review mode

`⌥R`, or the toolbar's review button. A read-only view of every file the agents
have changed, where you attach comments to line ranges and send the lot back as one
message.

It is a workspace *mode*, not a view: it replaces the panel mosaic and leaves it
mounted underneath, so switching is instant and no session is disturbed.

## What it is not

There is no red/green diff pane, and no before/after column. Those answer "what did
version N look like", which is rarely the question after an agent has rewritten a
file — you want to **read the code as it now stands, with the changed lines
findable**. So the entire diff surface is a 2.5px bar in the gutter: `success` for
added lines, `accent` for modified ones, nothing on untouched lines. The code column
reads like an editor while the bars register in peripheral vision.

## How tracking works

Two sources, in `electron/main/review/`:

**Tool events (primary).** `ReviewTracker` taps the same choke point that feeds the
renderer and watches for `tool-start` on the tools that name a file they're about to
write. `tool-start` fires when the model's `tool_use` block arrives — strictly
*before* the tool runs — which is the only moment the true "before" state is still on
disk. The snapshot read is deliberately synchronous: an `await` between the event and
the read is a window in which the edit lands first and the baseline captures the
result instead of the original.

**A git poll (backstop).** Every 5s, `git status --porcelain -uall` per workspace
root. This catches everything tool events can't see — a `sed` in Bash, a script the
agent ran, a subagent whose lane wasn't parsed. Its baselines come from `HEAD`,
because by the time a poll notices, that is the only "before" still available.

Baselines are **snapshot at first touch**, not diffed against the last commit. A file
the agent edited twice, or one that was already dirty when the turn started, would
otherwise report your own uncommitted work as the agent's.

Marks are computed against that baseline as runs of consecutive lines on the
*current* content. Where a baseline couldn't be captured — an unreadable file, or one
over 2MB — marks are suppressed rather than guessed, so a file can legitimately show
real content with no bars. Files over 2MB come back as `tooLarge` with no content at
all.

The set does not survive a restart. Persisting baselines would mean owning a cache
that goes stale against a moving working tree; a relaunch is a clean reset.

### Dismissal re-baselines

Dismissing a file (or all files) forgets it *and its baseline*. The next edit to that
file snapshots it afresh, so "reviewed and accepted" means the next diff starts from
what you accepted rather than replaying changes you already read. Nothing on disk is
touched.

### Viewed and unviewed

Each file remembers when you last opened it in review. A file whose latest change is
newer than that shows a solid accent dot and a full-weight name in the rail — the
inbox convention — and settles to faint once opened. The toolbar's review button
carries the tracked-file count from every surface, accent-filled while anything is
unviewed, so a queue growing behind a session panel is never silent. Viewing state
persists across restarts.

## The comment workflow

1. **Pick a file** in the rail. Files are grouped by workspace root (headed only when
   there's more than one), nested by directory, and ordered most-recently-changed
   first. The open file stays open when the set re-sorts.
2. **Select lines** by clicking a line number; shift-click extends, and dragging down
   the gutter selects a range.
3. **Write the comment** in the row that appears under the selection. Enter submits,
   Shift+Enter makes a newline — the same contract as the session composer.
4. **Resolve or delete** as you go. Resolved comments collapse to a struck-through
   line rather than vanishing: the record of what you already dealt with is the point.
5. **Send** — one message, every unresolved comment, to the session you choose. The
   default target is the session that last touched the open file, when that tab is
   still open.

Comments are stored in `localStorage` under `claudeview.review.comments.v1` and are
keyed by absolute path. They **survive dismissal of their file**, because the file
comes back the moment an agent touches it again and the note you wrote in between is
the one piece of state here that you authored. Only deleting or resolving removes a
comment; `Dismiss all` leaves them alone.

## The message format

```
Code review feedback (N comments):

## <relPath>
- **L<start>–L<end>** (`<excerpt>`): <comment text>
- ...

## <next file>
...

Please address each point and reply with what you changed per comment.
```

One message rather than one per comment: a review is a single unit of feedback, and
ten separate turns would have the agent re-planning after each one. Comments are
grouped by file and ordered by line — the order it will work through them in. Every
comment included is stamped `sentAt` and shows a faint "sent" chip afterwards; it
stays in the list so you can see what you already asked for.

## IPC surface

| Channel | Purpose |
| --- | --- |
| `review:list` | The whole set, most-recently-changed first. No file contents. |
| `review:file` | `{ content, marks, tooLarge }` for one tracked path, or `null`. |
| `review:dismiss` / `review:dismiss-all` | Forget paths, losing their baselines. |
| `review:event` | Push of the **whole** current set on every change, with a `seq`. |

Contents are never in the push: a set can span hundreds of files and the pane shows
one, so bodies are fetched per file. Pushes carry the full list rather than a delta,
which removes any incremental renderer state that could fall out of sync when a push
is dropped, duplicated, or arrives during a reload — `seq` suppresses duplicates the
same way `StreamEnvelope.seq` does.

Only tracked paths are readable through `review:file`. The renderer displays
model-authored HTML, so a general "read any file" call would turn a rendering escape
into arbitrary disk access.
