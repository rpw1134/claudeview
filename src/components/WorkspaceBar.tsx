import {
  Columns2,
  LayoutGrid,
  MessageSquarePlus,
  Rows2,
  Settings2,
  SquareTerminal,
} from 'lucide-react'
import { MAX_PANELS } from '@/stores/workspaceStore'
import type { SplitDirection } from '@/lib/layoutTree'
import { Button } from './ui/Button'

/**
 * Window toolbar: add panels, tidy the layout, open settings.
 *
 * ## Everything is flush right, and that's the point
 *
 * These controls used to start on the left, which on macOS means starting *after
 * the traffic lights* — 84px in, while panel content below begins at 48px (the
 * mosaic's 8px padding plus a panel's 40px gutter). No amount of tuning fixes that:
 * the OS owns the top-left corner and nothing can share it.
 *
 * So nothing tries. The left is empty drag region, the controls sit against the
 * right edge on the same vertical line as the content beneath them, and there is no
 * left-aligned chrome left to be misaligned.
 *
 * ## No fill
 *
 * The bar used to carry `bg-surface`, which put two stacked horizontal bands across
 * the top of the window — toolbar, then panel header — before any content. That's
 * two claims on the same piece of hierarchy. Dropping the fill leaves exactly one
 * labelled strip on screen (the panel header) and turns this into floating controls
 * over the window background.
 *
 * ## Icons only
 *
 * At one uniform size, matching the split controls. Text labels here competed with
 * panel titles directly below them at similar weight, for actions that already have
 * shortcuts — and the home screen teaches those shortcuts on first run.
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
  const atCapacity = panelCount >= MAX_PANELS

  return (
    <div
      data-drag-region
      // `pr-12` = the mosaic's 8px padding + a panel's 40px gutter, so the last
      // control lands on the same vertical line as the content below it.
      className="flex h-12 shrink-0 items-center justify-end gap-0.5 pr-12"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddSession('row')}
        disabled={atCapacity}
        aria-label="New session panel"
        title="New session — ⌘T / ⌥T"
      >
        <MessageSquarePlus size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddTerminal('row')}
        disabled={atCapacity}
        aria-label="New terminal panel"
        title="New terminal — ⇧⌘T / ⌥C"
      >
        <SquareTerminal size={15} />
      </Button>

      <Divider />

      {/* Which way the next panel splits the focused one. Dragging can rearrange
          afterwards; this just avoids an obvious extra drag for the common case. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddSession('row')}
        disabled={atCapacity}
        aria-label="Add panel to the right"
        title="Split right — ⌥A"
      >
        <Columns2 size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddSession('column')}
        disabled={atCapacity}
        aria-label="Add panel below"
        title="Split down — ⌥S"
      >
        <Rows2 size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onBalance}
        disabled={panelCount < 2}
        aria-label="Even out panel sizes"
        title="Even out panel sizes"
      >
        <LayoutGrid size={15} />
      </Button>

      <Divider />

      {/* Only once you're near the ceiling. A permanent "0/8" is a number nobody
          reads until it starts mattering. */}
      {panelCount >= MAX_PANELS - 2 ? (
        <span className="px-1 text-xs tabular-nums text-text-faint">
          {panelCount}/{MAX_PANELS}
        </span>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        aria-label="Appearance settings"
        title="Appearance — ⌘,"
      >
        <Settings2 size={15} />
      </Button>
    </div>
  )
}

function Divider() {
  return <div className="mx-1.5 h-4 w-px bg-line" aria-hidden />
}
