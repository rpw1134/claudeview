import { memo } from 'react'
import { MessagesSquare, SquareTerminal, X } from 'lucide-react'
import type { Panel } from '@/stores/workspaceStore'
import { selectPanelNumber, useWorkspaceStore } from '@/stores/workspaceStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useZoomStore } from '@/stores/zoomStore'
import { TerminalPanel } from './TerminalPanel'
import { SessionPanel } from './SessionPanel'
import { PendingSessionPanel } from './PendingSessionPanel'
import { ActivityIndicator, isBusyStatus } from './ActivityIndicator'
import { Button } from './ui/Button'
import { cn, compactTokens, shortenPath } from '@/lib/utils'

/**
 * One panel: header plus content.
 *
 * The header is the drag handle. Making the whole panel draggable would fight
 * every interaction inside it — selecting transcript text, clicking a tool call,
 * typing in a terminal — so the grab affordance is confined to a strip that has no
 * other job.
 *
 * ## Focus is the leading icon
 *
 * Focus used to be an accent ring around the whole panel. At eight panels that ring
 * is a large, bright rectangle competing with the content inside it, and it only
 * ever says one bit. Now the panel's own type icon — top left, first thing in the
 * header — turns accent when focused and stays faint when not.
 *
 * Colour isn't the only carrier: the focused panel's title also moves to full
 * contrast while the others sit at muted. One glance finds the live panel; nothing
 * on screen has to grow a border to say so.
 *
 * ## The header's narrowing order
 *
 * Everything in the header competes for one 32px strip, so what it drops as the
 * panel narrows is a ranking of what a panel owes you. In order of what survives:
 * the focus icon and panel number (never drop), the **directory** (never drops —
 * it's the fact that decides whether you're about to type into the right repo),
 * the title (truncates), and model/tokens (gone below 32rem).
 */
export const PanelFrame = memo(function PanelFrame({
  panel,
  focused,
  autoFocusToken,
  home,
  onFocus,
  onClose,
  onHeaderPointerDown,
}: {
  panel: Panel
  focused: boolean
  autoFocusToken: number
  home?: string
  onFocus: () => void
  onClose: () => void
  onHeaderPointerDown: (event: React.PointerEvent) => void
}) {
  // Session panels read their live title and status from the session store, so a
  // renamed or busy session shows through in the header.
  const tab = useSessionStore((state) =>
    panel.kind === 'session' ? state.tabs.find((entry) => entry.id === panel.refId) : undefined,
  )
  // Visual order, same numbering as the ⌥1–⌥8 shortcuts — recomputed from the
  // layout tree, so a panel dragged to the front becomes #1 without a rename.
  const number = useWorkspaceStore(selectPanelNumber(panel.id))
  // ⌘+ / ⌘- / ⌘0, per panel. Applied below to the content only.
  const zoom = useZoomStore((state) => state.zoom[panel.id] ?? 1)

  const title = tab?.title ?? panel.title
  // The session's own cwd wins: the CLI reports where it actually attached, which
  // is the truth a resumed session carries and the panel record only predicted.
  // A pre-start panel falls back to its *proposed* directory so the header tells
  // the same story before and after the session exists — the path doesn't appear
  // out of nowhere the moment you press Enter.
  const cwd = tab?.cwd ?? panel.cwd ?? panel.pending?.cwd
  const Icon = panel.kind === 'terminal' ? SquareTerminal : MessagesSquare
  const isBusy = tab ? isBusyStatus(tab.status) : false

  // Model and token totals used to live in a window-level status strip. They're
  // per-session facts, so they belong on the session's own header — and keeping
  // them here is what let that strip (and its focus jitter) go away entirely.
  const tokens = tab ? tab.usage.inputTokens + tab.usage.outputTokens : 0
  const meta = tab
    ? [tab.model, tokens > 0 ? `${compactTokens(tokens)} tok` : null].filter(Boolean).join(' · ')
    : undefined

  return (
    <section
      onMouseDownCapture={onFocus}
      aria-label={title}
      aria-current={focused ? 'true' : undefined}
      // `@container` so the header and the composer can adapt to the panel's own
      // width rather than the window's — a half-width panel and a one-eighth panel
      // need different treatments at the same viewport size.
      className="@container hand-1 flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface"
    >
      <header
        onPointerDown={onHeaderPointerDown}
        className="flex h-8 shrink-0 cursor-grab items-center gap-2 px-2 text-xs active:cursor-grabbing"
      >
        {/* Visual position, matching the ⌥1–⌥8 focus shortcuts — quiet enough not
            to compete with the focus indicator right next to it. */}
        {number > 0 ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-text-faint">{number}</span>
        ) : null}

        {/* The focus indicator. First element, hard left, and the only thing in the
            header that changes colour. */}
        <Icon
          size={13}
          className={cn(
            'shrink-0 transition-colors duration-150',
            focused ? 'text-accent' : 'text-text-faint',
          )}
          aria-hidden
        />

        {/* Title gives up width first: it's the one thing here you named
            yourself, so it's the one thing you can reconstruct from memory. */}
        <span
          className={cn('min-w-0 flex-1 truncate', focused ? 'text-text' : 'text-text-muted')}
          title={title}
        >
          {title}
        </span>

        {/*
          Glyph only. The transcript carries the labelled indicator, at the tail of
          the conversation where you're actually looking after pressing Enter;
          spelling out "Thinking 0s" here as well says the same thing twice, a
          hand's width apart. This one exists for the panels you're *not* looking
          at — it's how a background panel says it's still working.
        */}
        {tab && isBusy ? <ActivityIndicator status={tab.status} compact /> : null}

        {/*
          The directory outranks the metrics, and the previous order had it
          backwards: model and token count held the line while the cwd dropped
          out at 28rem, so the narrower the panel — the more panels you had open,
          the easier they were to confuse — the less each one said about where it
          was. Now the path is the last thing to go (it never goes), and model and
          tokens, which are only ever glanceable trivia, leave first.

          Full path on hover, since what's shown is shortened to three segments.
        */}
        {cwd ? (
          <span
            className="min-w-0 max-w-[55%] shrink-0 truncate font-mono text-xs text-text-faint"
            title={cwd}
          >
            {/* Below 20rem even a three-segment path eats the whole strip and
                squeezes the title to nothing, so the narrowest panels show the
                directory's own name — the part that identifies it — and the
                full path stays one hover away. */}
            <span className="@[20rem]:hidden">{cwd.split('/').filter(Boolean).pop()}</span>
            <span className="hidden @[20rem]:inline">{shortenPath(cwd, home)}</span>
          </span>
        ) : null}

        {meta ? (
          <span
            className="hidden shrink-0 font-mono text-xs text-text-faint @[32rem]:inline"
            title={meta}
          >
            {/* The separator belongs to the metadata, not between it and the
                path: it has to disappear along with the thing it separates. */}
            <span className="mr-1 opacity-50">·</span>
            {meta}
          </span>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          // Stop the header's drag handler from claiming this press.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="shrink-0"
        >
          <X size={12} />
        </Button>
      </header>

      {/*
        Zoom scales the CONTENT, not the panel.

        It used to wrap the whole frame, which scaled the header along with the
        transcript: at 1.6 a panel's chrome — title, path, close button — grew by
        60% and ate the reading area you had just asked for more of, and eight
        panels at different factors had eight different header heights, so the
        row of headers stopped being a straight line across the window. Zoom is a
        reading posture for the document; the chrome is a fixed instrument panel.

        CSS `zoom` rather than `transform: scale()` because it participates in
        layout — the content reflows to the panel's real width at the new size
        instead of being drawn large and clipped. It isn't in React's CSS types,
        hence the cast.
      */}
      <div
        className="min-h-0 flex-1 overflow-hidden bg-bg"
        style={zoom === 1 ? undefined : ({ zoom } as React.CSSProperties)}
      >
        {panel.kind === 'session' && panel.pending ? (
          // No tab exists yet, so the transcript is empty — but the shell is the
          // same one the session will use, and the first message starts it.
          <PendingSessionPanel
            panelId={panel.id}
            cwd={panel.pending.cwd}
            home={home}
            panelFocused={focused}
            autoFocusToken={autoFocusToken}
          />
        ) : panel.kind === 'terminal' ? (
          <TerminalPanel
            terminalId={panel.refId}
            cwd={panel.cwd}
            focused={focused}
            onFocus={onFocus}
          />
        ) : (
          <SessionPanel
            tabId={panel.refId}
            panelFocused={focused}
            autoFocusToken={focused ? autoFocusToken : 0}
          />
        )}
      </div>
    </section>
  )
})
