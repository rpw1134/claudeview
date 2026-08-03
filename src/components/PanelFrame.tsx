import { memo } from 'react'
import { GripVertical, MessagesSquare, SquareTerminal, X } from 'lucide-react'
import type { Panel } from '@/stores/workspaceStore'
import { useSessionStore } from '@/stores/sessionStore'
import { TerminalPanel } from './TerminalPanel'
import { SessionPanel } from './SessionPanel'
import { Button } from './ui/Button'
import { cn, compactTokens, shortenPath } from '@/lib/utils'

/**
 * One panel: header plus content.
 *
 * The header is the drag handle. Making the whole panel draggable would fight
 * every interaction inside it — selecting transcript text, clicking a tool call,
 * typing in a terminal — so the grab affordance is confined to a strip that has no
 * other job.
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
  const isBusy = tab?.status === 'thinking' || tab?.status === 'streaming' || tab?.status === 'tool'

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
      // `@container` so the header can drop the cwd in a narrow panel.
      className={cn(
        '@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-surface',
        // The focused panel carries the only ring on screen, and it encodes
        // something real: where the message bar will send.
        focused ? 'ring-1 ring-accent' : 'ring-1 ring-transparent',
      )}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          'group flex h-8 shrink-0 cursor-grab items-center gap-2 px-2 text-xs active:cursor-grabbing',
          focused ? 'text-text' : 'text-text-muted',
        )}
      >
        <GripVertical
          size={12}
          className="shrink-0 text-text-faint opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
        <Icon size={13} className="shrink-0 text-text-faint" />
        <span className="truncate">{title}</span>
        {isBusy ? (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
        ) : null}

        <span
          className="ml-auto truncate font-mono text-xs text-text-faint"
          title={[panel.cwd, meta].filter(Boolean).join('  ·  ')}
        >
          {/* Metadata first: it changes as you work, whereas cwd is fixed and
              already implied by the session's title. Narrow panels drop the cwd. */}
          {meta ? <span>{meta}</span> : null}
          {meta && panel.cwd ? <span className="mx-1 opacity-50">·</span> : null}
          {panel.cwd ? (
            <span className="hidden @[22rem]:inline">{shortenPath(panel.cwd, home)}</span>
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

      <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg bg-bg">
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
