import { LayoutGrid, MessageSquarePlus, Settings2, SquareTerminal } from 'lucide-react'
import { LAYOUTS, MAX_PANELS, type LayoutId } from '@/stores/workspaceStore'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/**
 * Window toolbar: add panels, pick a layout, open settings.
 *
 * Doubles as the macOS drag region, so the title bar isn't wasted space.
 *
 * Layout options are shown as miniature diagrams rather than names — the shape is
 * the thing you're choosing, and a 20px glyph communicates it faster than the word
 * "Quadrants". Each still carries a text label for the accessible name.
 */
export function WorkspaceBar({
  layout,
  panelCount,
  onLayout,
  onAddSession,
  onAddTerminal,
  onOpenSettings,
}: {
  layout: LayoutId
  panelCount: number
  onLayout: (layout: LayoutId) => void
  onAddSession: () => void
  onAddTerminal: () => void
  onOpenSettings: () => void
}) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
  const atCapacity = panelCount >= MAX_PANELS

  return (
    <div
      data-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3"
      style={{ paddingLeft: isMac ? 84 : 12 }}
    >
      <Button variant="subtle" size="md" onClick={onAddSession} disabled={atCapacity}>
        <MessageSquarePlus size={14} />
        Session
      </Button>
      <Button variant="subtle" size="md" onClick={onAddTerminal} disabled={atCapacity}>
        <SquareTerminal size={14} />
        Terminal
      </Button>

      <div className="mx-2 h-5 w-px bg-line" aria-hidden />

      <div role="group" aria-label="Layout" className="flex items-center gap-1">
        <LayoutGrid size={13} className="mr-1 shrink-0 text-text-faint" aria-hidden />
        {LAYOUTS.map((spec) => {
          const isActive = spec.id === layout
          // A layout that can't hold the open panels would hide some of them.
          const tooSmall = spec.slots < panelCount
          return (
            <button
              key={spec.id}
              onClick={() => onLayout(spec.id)}
              disabled={tooSmall}
              aria-pressed={isActive}
              aria-label={spec.label}
              title={tooSmall ? `${spec.label} — too few slots for ${panelCount} panels` : spec.label}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150',
                isActive ? 'bg-raised' : 'hover:bg-raised/60',
                tooSmall && 'pointer-events-none opacity-30',
              )}
            >
              <LayoutGlyph spec={spec} active={isActive} />
            </button>
          )
        })}
      </div>

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

/** Miniature of the layout, drawn from the same grid template the panel grid uses. */
function LayoutGlyph({
  spec,
  active,
}: {
  spec: (typeof LAYOUTS)[number]
  active: boolean
}) {
  return (
    <span
      className="grid h-4 w-4 gap-px"
      style={{ gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows }}
      aria-hidden
    >
      {Array.from({ length: spec.slots }, (_, index) => (
        <span
          key={index}
          className={cn('rounded-[1px]', active ? 'bg-accent' : 'bg-text-faint')}
        />
      ))}
    </span>
  )
}
