import { Plus, X } from 'lucide-react'
import type { Tab } from '@/types/session'
import { cn } from '@/lib/utils'
import { Button } from './ui/Button'

const STATUS_COLOR: Record<Tab['status'], string> = {
  starting: 'bg-warning',
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
 * Each tab shows a status dot rather than a spinner: with several sessions running
 * at once, a row of spinners is visual noise, while a colour-coded dot conveys the
 * same state peripherally. It's paired with a text label in the status bar, so
 * colour is never the only signal.
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
  return (
    <div
      data-drag-region
      className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-bg pr-2"
      style={{
        // Clear the macOS traffic lights, which overlay the title bar area.
        paddingLeft: navigator.platform.startsWith('Mac') ? 80 : 8,
      }}
    >
      <div role="tablist" aria-label="Sessions" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
                'group flex h-8 min-w-0 shrink-0 cursor-default items-center gap-2 rounded-md px-2.5 text-xs transition-colors',
                isActive
                  ? 'bg-surface-raised text-text'
                  : 'text-text-muted hover:bg-surface hover:text-text',
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
              <span className="max-w-44 truncate">{tab.title}</span>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
                aria-label={`Close ${tab.title}`}
                className={cn(
                  'ml-0.5 shrink-0 rounded p-0.5 text-text-faint transition-colors hover:bg-border hover:text-text',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>

      <Button variant="ghost" size="icon" onClick={onNew} aria-label="New session" title="New session (⌘T)">
        <Plus size={14} />
      </Button>
    </div>
  )
}
