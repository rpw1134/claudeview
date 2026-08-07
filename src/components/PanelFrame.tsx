import { memo } from 'react'
import { MessagesSquare, SquareTerminal, X } from 'lucide-react'
import type { Panel } from '@/stores/workspaceStore'
import { useSessionStore } from '@/stores/sessionStore'
import { TerminalPanel } from './TerminalPanel'
import { SessionPanel } from './SessionPanel'
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

  const title = tab?.title ?? panel.title
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

        <span className={cn('truncate', focused ? 'text-text' : 'text-text-muted')}>{title}</span>

        {/*
          Glyph only. The transcript carries the labelled indicator, at the tail of
          the conversation where you're actually looking after pressing Enter;
          spelling out "Thinking 0s" here as well says the same thing twice, a
          hand's width apart. This one exists for the panels you're *not* looking
          at — it's how a background panel says it's still working.
        */}
        {tab && isBusy ? <ActivityIndicator status={tab.status} compact /> : null}

        <span
          className="ml-auto truncate font-mono text-xs text-text-faint"
          title={[panel.cwd, meta].filter(Boolean).join('  ·  ')}
        >
          {/* Metadata first: it changes as you work, whereas cwd is fixed and
              already implied by the session's title. Narrow panels drop the cwd. */}
          {meta ? <span className="hidden @[20rem]:inline">{meta}</span> : null}
          {meta && panel.cwd ? <span className="mx-1 hidden opacity-50 @[28rem]:inline">·</span> : null}
          {panel.cwd ? (
            <span className="hidden @[28rem]:inline">{shortenPath(panel.cwd, home)}</span>
          ) : null}
        </span>

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

      <div className="min-h-0 flex-1 overflow-hidden bg-bg">
        {panel.kind === 'terminal' ? (
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
