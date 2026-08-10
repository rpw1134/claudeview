import {
  Columns2,
  LayoutGrid,
  MessageSquarePlus,
  Rows2,
  Settings2,
  SquareTerminal,
} from 'lucide-react'
import { MAX_PANELS } from '@/stores/workspaceStore'
import { isUnviewed, useReviewStore } from '@/stores/reviewStore'
import type { SplitDirection } from '@/lib/layoutTree'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/** The three top-level surfaces, navigated as tabs. */
export type Surface = 'sessions' | 'review' | 'config'

/**
 * Window toolbar: surface tabs on the left of the control cluster, panel
 * management and settings on the right.
 *
 * ## Tabs, not toggles
 *
 * Navigation used to be asymmetric — config was a toggle that swapped the whole
 * window, review was a "mode" behind an icon, and sessions were just "what's
 * left" — three different mental models for one decision: *what am I looking
 * at?* One tab strip answers it. Sessions and Review share a connected group
 * because review is a lens on the sessions' work, not a sibling concern; Config
 * sits apart after a gap because it is one.
 *
 * The Review tab only exists while there is something to review. A permanently
 * visible empty destination teaches people to stop looking at it — the tab
 * appearing *is* the signal that review has become relevant.
 *
 * ## Everything is flush right, and that's the point
 *
 * On macOS the OS owns the top-left corner (traffic lights), so left-aligned
 * chrome can never line up with the content below it. Nothing tries: the left
 * is empty drag region, controls sit against the right edge on the same
 * vertical line as panel content.
 */
export function WorkspaceBar({
  panelCount,
  surface,
  onSurface,
  onAddSession,
  onAddTerminal,
  onBalance,
  onOpenSettings,
}: {
  panelCount: number
  surface: Surface
  onSurface: (surface: Surface) => void
  onAddSession: (direction: SplitDirection) => void
  onAddTerminal: (direction: SplitDirection) => void
  onBalance: () => void
  onOpenSettings: () => void
}) {
  const atCapacity = panelCount >= MAX_PANELS
  const reviewCount = useReviewStore((state) => state.files.length)
  const hasUnviewed = useReviewStore((state) =>
    state.files.some((file) => isUnviewed(file, state.viewedAt)),
  )

  return (
    <div
      data-drag-region
      // `pr-12` = the mosaic's 8px padding + a panel's 40px gutter, so the last
      // control lands on the same vertical line as the content below it.
      className="flex h-12 shrink-0 items-center justify-end gap-0.5 pr-12"
    >
      <nav
        aria-label="Surface"
        className="mr-2 flex items-center gap-2"
      >
        <div className="hand-sm-2 flex items-stretch gap-0.5 bg-surface p-0.5">
          <SurfaceTab
            label="Sessions"
            selected={surface === 'sessions'}
            title="Sessions"
            onClick={() => onSurface('sessions')}
          />
          {reviewCount > 0 ? (
            <SurfaceTab
              label="Review"
              selected={surface === 'review'}
              title="Review — ⌥R"
              onClick={() => onSurface('review')}
              badge={reviewCount > 99 ? '99+' : String(reviewCount)}
              badgeAccent={hasUnviewed}
            />
          ) : null}
        </div>
        <div className="hand-sm-2 flex items-stretch bg-surface p-0.5">
          <SurfaceTab
            label="Config"
            selected={surface === 'config'}
            title="Claude config — ⌥K"
            onClick={() => onSurface('config')}
          />
        </div>
      </nav>

      {/* Panel-management controls act on the mosaic and are meaningless on any
          other surface, so they're gone rather than merely disabled there. */}
      {surface === 'sessions' ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onAddSession('row')}
            disabled={atCapacity}
            aria-label="New session panel"
            title="New session — ⌥T"
          >
            <MessageSquarePlus size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onAddTerminal('row')}
            disabled={atCapacity}
            aria-label="New terminal panel"
            title="New terminal — ⌥C"
          >
            <SquareTerminal size={15} />
          </Button>

          <Divider />

          {/* Which way the next panel splits the focused one. Dragging can
              rearrange afterwards; this just avoids an obvious extra drag for
              the common case. */}
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

          {/* Only once you're near the ceiling. A permanent "0/8" is a number
              nobody reads until it starts mattering. */}
          {panelCount >= MAX_PANELS - 2 ? (
            <span className="px-1 text-xs tabular-nums text-text-faint">
              {panelCount}/{MAX_PANELS}
            </span>
          ) : null}
        </>
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

/**
 * One tab. `aria-current` rather than `aria-pressed`: these are locations, not
 * toggles — the whole point of the redesign.
 */
function SurfaceTab({
  label,
  selected,
  title,
  badge,
  badgeAccent,
  onClick,
}: {
  label: string
  selected: boolean
  title: string
  badge?: string
  badgeAccent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'page' : undefined}
      title={title}
      className={cn(
        'hand-sm-1 flex items-center gap-1.5 px-2.5 text-xs transition-colors',
        selected ? 'bg-accent-wash text-text' : 'text-text-muted hover:bg-raised hover:text-text',
      )}
    >
      {label}
      {badge ? (
        <span
          className={cn(
            'flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1',
            'text-[9px] font-medium leading-none tabular-nums',
            badgeAccent ? 'bg-accent text-accent-contrast' : 'bg-raised text-text-faint',
          )}
          aria-label={`${badge} changed files`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function Divider() {
  return <div className="mx-1.5 h-4 w-px bg-line" aria-hidden />
}
