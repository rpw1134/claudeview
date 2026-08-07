import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Small shared pieces for the config editors, so AgentEditor / SkillEditor /
 * HooksEditor agree on what an input, a header, and a save cycle look like.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * One save cycle: run the write, show "Saved" briefly, surface a failure.
 * The timer is held in a ref so rapid saves restart the fade instead of a stale
 * timeout clearing a newer "Saved".
 */
export function useSaveState(): { state: SaveState; run: (fn: () => Promise<void>) => void } {
  const [state, setState] = useState<SaveState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const run = (fn: () => Promise<void>) => {
    clearTimeout(timerRef.current)
    setState('saving')
    fn()
      .then(() => {
        setState('saved')
        timerRef.current = setTimeout(() => setState('idle'), 1500)
      })
      .catch(() => setState('error'))
  }

  return { state, run }
}

export function EditorHeader({
  onBack,
  title,
  dirty,
  saveState,
  children,
}: {
  onBack: () => void
  title: string
  dirty: boolean
  saveState: SaveState
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to list">
        <ArrowLeft size={13} />
      </Button>
      <span className="truncate font-mono text-sm text-text">{title}</span>
      <span className="text-xs text-text-faint" role="status">
        {saveState === 'saving'
          ? 'Saving…'
          : saveState === 'error'
            ? 'Save failed'
            : saveState === 'saved'
              ? 'Saved'
              : dirty
                ? 'Edited'
                : ''}
      </span>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  )
}

const inputClasses =
  'w-full hand-sm-2 border border-line-strong bg-raised px-3 text-sm text-text ' +
  'placeholder:text-text-faint transition-colors hover:border-accent'

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
  'aria-label'?: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(inputClasses, 'h-9', mono && 'font-mono')}
    />
  )
}

export function TextArea({
  value,
  onChange,
  rows,
  mono,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  rows: number
  mono?: boolean
  'aria-label'?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      aria-label={ariaLabel}
      spellCheck={false}
      className={cn(inputClasses, 'resize-y py-2 leading-relaxed', mono && 'font-mono text-xs')}
    />
  )
}
