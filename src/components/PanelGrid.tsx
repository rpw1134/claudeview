import { memo } from 'react'
import { SquareTerminal, MessagesSquare, X } from 'lucide-react'
import { layoutSpec, type Panel } from '@/stores/workspaceStore'
import { useSessionStore } from '@/stores/sessionStore'
import type { LayoutId } from '@/stores/workspaceStore'
import { TerminalPanel } from './TerminalPanel'
import { SessionPanel } from './SessionPanel'
import { Button } from './ui/Button'
import { cn, shortenPath } from '@/lib/utils'

/**
 * The panel workspace.
 *
 * A CSS grid driven by the active layout preset. Panels fill slots in order; an
 * empty trailing slot renders as a placeholder rather than collapsing, so the grid
 * shape stays honest about how much room each panel has.
 *
 * Focus is the load-bearing concept: exactly one panel is focused, it's marked with
 * an accent ring, and the message bar at the bottom targets it. Without a single
 * unambiguous focus there'd be no way to know where a typed message is going.
 */
export function PanelGrid({
  panels,
  layout,
  focusedPanelId,
  home,
  onFocus,
  onClose,
}: {
  panels: Panel[]
  layout: LayoutId
  focusedPanelId: string | null
  home?: string
  onFocus: (panelId: string) => void
  onClose: (panelId: string) => void
}) {
  const spec = layoutSpec(layout)

  return (
    <div
      className="grid min-h-0 flex-1 gap-2 p-2"
      style={{ gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows }}
    >
      {panels.map((panel) => (
        <PanelFrame
          key={panel.id}
          panel={panel}
          focused={panel.id === focusedPanelId}
          home={home}
          onFocus={() => onFocus(panel.id)}
          onClose={() => onClose(panel.id)}
        />
      ))}
    </div>
  )
}

const PanelFrame = memo(function PanelFrame({
  panel,
  focused,
  home,
  onFocus,
  onClose,
}: {
  panel: Panel
  focused: boolean
  home?: string
  onFocus: () => void
  onClose: () => void
}) {
  // Session panels take their live title and status from the session store, so a
  // renamed or busy session shows through in the header.
  const tab = useSessionStore((state) =>
    panel.kind === 'session' ? state.tabs.find((entry) => entry.id === panel.refId) : undefined,
  )

  const title = tab?.title ?? panel.title
  const Icon = panel.kind === 'terminal' ? SquareTerminal : MessagesSquare
  const isBusy =
    tab?.status === 'thinking' || tab?.status === 'streaming' || tab?.status === 'tool'

  return (
    <section
      onMouseDownCapture={onFocus}
      aria-label={title}
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-surface',
        // The focused panel is the only one with a ring. One boundary, and it
        // encodes something real: where your keystrokes are going.
        focused ? 'ring-1 ring-accent' : 'ring-1 ring-transparent',
      )}
    >
      <header
        className={cn(
          'flex h-8 shrink-0 items-center gap-2 px-2 text-xs',
          focused ? 'text-text' : 'text-text-muted',
        )}
      >
        <Icon size={13} className="shrink-0 text-text-faint" />
        <span className="truncate">{title}</span>
        {isBusy ? (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
        ) : null}
        {panel.cwd ? (
          <span className="ml-auto truncate font-mono text-xs text-text-faint" title={panel.cwd}>
            {shortenPath(panel.cwd, home)}
          </span>
        ) : (
          <span className="ml-auto" />
        )}
        <Button
          variant="ghost"
          size="icon"
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
          <SessionPanel tabId={panel.refId} />
        )}
      </div>
    </section>
  )
})
