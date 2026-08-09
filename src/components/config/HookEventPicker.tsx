import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { HOOK_EVENTS } from './hookEvents'

/**
 * "Add hook" as a small owned popover rather than a native/`Select` picker —
 * each event needs its description alongside the name to be pickable at a
 * glance, and `Select`'s items only carry a single-line label.
 */
export function HookEventPicker({ onPick }: { onPick: (event: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickAway = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button variant="subtle" size="sm" onClick={() => setOpen((value) => !value)}>
        <Plus size={12} /> Add hook <ChevronDown size={12} className="text-text-faint" />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="Hook event"
          className="hand-1 absolute top-full left-0 z-50 mt-1 max-h-80 w-72 overflow-y-auto bg-overlay p-1 shadow-lg ring-1 ring-line"
        >
          {HOOK_EVENTS.map((event) => (
            <button
              key={event.id}
              type="button"
              role="option"
              onClick={() => {
                onPick(event.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full flex-col gap-0.5 hand-sm-1 px-2.5 py-1.5 text-left transition-colors',
                'hover:bg-raised',
              )}
            >
              <span className="text-sm text-text">{event.id}</span>
              <span className="text-xs text-text-faint">{event.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
