import { Columns2, LayoutGrid, MessageSquarePlus, Rows2, Settings2, SquareTerminal } from 'lucide-react'
import { MAX_PANELS } from '@/stores/workspaceStore'
import type { SplitDirection } from '@/lib/layoutTree'
import { Button } from './ui/Button'

/**
 * Window toolbar: add panels, tidy the layout, open settings.
 *
 * There is no layout picker any more — the arrangement is whatever you drag it
 * into. What remains is choosing which way a *new* panel splits the focused one,
 * and a way to reset uneven splits.
 *
 * Doubles as the macOS drag region, so the title bar isn't wasted space.
 */
export function WorkspaceBar({
  panelCount,
  onAddSession,
  onAddTerminal,
  onBalance,
  onOpenSettings,
}: {
  panelCount: number
  onAddSession: (direction: SplitDirection) => void
  onAddTerminal: (direction: SplitDirection) => void
  onBalance: () => void
  onOpenSettings: () => void
}) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
  const atCapacity = panelCount >= MAX_PANELS

  return (
    <div
      data-drag-region
      /*
       * The right gutter is the mosaic's outer padding (8px) plus a panel's own
       * (40px), so the settings button lands on exactly the same vertical line as
       * the content beneath it. Getting this wrong by 16px is invisible until you
       * look for it and then impossible to unsee.
       *
       * The left can't match: the traffic lights own that space on macOS. Nothing
       * else can sit there, so there's nothing to align to.
       */
      className="flex h-12 shrink-0 items-center gap-2 bg-surface/70 pr-12"
      style={{ paddingLeft: isMac ? 84 : 16 }}
    >
      <Button variant="subtle" size="md" onClick={() => onAddSession('row')} disabled={atCapacity}>
        <MessageSquarePlus size={14} />
        Session
      </Button>
      <Button variant="subtle" size="md" onClick={() => onAddTerminal('row')} disabled={atCapacity}>
        <SquareTerminal size={14} />
        Terminal
      </Button>

      <div className="mx-2 h-5 w-px bg-line" aria-hidden />

      {/* Which way the next panel splits the focused one. Dragging can rearrange
          afterwards; this just avoids an obvious extra drag for the common case. */}
      <span className="text-xs text-text-faint">Split</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddSession('row')}
        disabled={atCapacity}
        aria-label="Add panel to the right"
        title="Add panel to the right"
      >
        <Columns2 size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddSession('column')}
        disabled={atCapacity}
        aria-label="Add panel below"
        title="Add panel below"
      >
        <Rows2 size={14} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onBalance}
        disabled={panelCount < 2}
        aria-label="Even out panel sizes"
        title="Even out panel sizes"
      >
        <LayoutGrid size={14} />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-text-faint">
          {panelCount}/{MAX_PANELS}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="Appearance settings"
          title="Appearance (⌘,)"
        >
          <Settings2 size={14} />
        </Button>
      </div>
    </div>
  )
}
