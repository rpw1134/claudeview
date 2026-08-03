import { Plus, X } from 'lucide-react'
import type { Tab } from '@/types/session'
import { cn } from '@/lib/utils'
import { Button } from './ui/Button'

/** Status colour is paired with a text label in the status bar — never colour alone. */
const STATUS_COLOR: Record<Tab['status'], string> = {
  starting: 'bg-text-faint',
  ready: 'bg-success',
  idle: 'bg-text-faint',
  thinking: 'bg-accent',
  streaming: 'bg-accent',
  tool: 'bg-warning',
  error: 'bg-danger',
  closed: 'bg-text-faint',
}

/**
 * The tab strip, doubling as the window drag region on macOS.
 *
 * Tabs are distinguished by fill, not outline — the active tab is the only raised
 * surface in the row, which is enough to read as selected without adding a border
 * on top of the strip's own bottom rule.
 *
 * The close button appears on hover for inactive tabs, so a row of tabs isn't a
 * row of ✕ glyphs competing with the titles.
 */
export function TabStrip({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: Tab[]
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  onNew: () => void
}) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')

  return (
    <div
      data-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2"
      // Clear the macOS traffic lights, which overlay the title bar area.
      style={{ paddingLeft: isMac ? 84 : 8 }}
    >
      <div
        role="tablist"
        aria-label="Sessions"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(tab.id)
                }
              }}
              className={cn(
                'group flex h-8 min-w-0 shrink-0 cursor-default items-center gap-2 rounded-md px-3 text-xs',
                'transition-colors duration-150',
                isActive
                  ? 'bg-raised text-text'
                  : 'text-text-muted hover:bg-raised/60 hover:text-text',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  STATUS_COLOR[tab.status],
                  (tab.status === 'thinking' || tab.status === 'streaming') && 'animate-pulse',
                )}
                aria-hidden
              />
              <span className="max-w-48 truncate">{tab.title}</span>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
                aria-label={`Close ${tab.title}`}
                className={cn(
                  'shrink-0 rounded-sm p-0.5 text-text-faint transition-colors',
                  'hover:bg-overlay hover:text-text',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onNew}
        aria-label="New session"
        title="New session (⌘T)"
      >
        <Plus size={15} />
      </Button>
    </div>
  )
}
