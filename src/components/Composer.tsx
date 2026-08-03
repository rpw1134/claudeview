import { useCallback, useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Square } from 'lucide-react'
import type { SessionStatus } from '@shared/ipc'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

const MAX_HEIGHT_PX = 200

/**
 * Message input.
 *
 * Sending is allowed even while the model is mid-response: the SDK queues user
 * turns and processes them in order, so there's no reason to disable the control
 * and force the user to wait for a turn to finish before typing a correction.
 */
export function Composer({
  status,
  onSend,
  onInterrupt,
  disabled,
}: {
  status: SessionStatus
  onSend: (text: string) => void
  onInterrupt: () => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isBusy = status === 'thinking' || status === 'streaming' || status === 'tool'

  // Grow with content up to a cap, then scroll internally.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [value])

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
    // Return focus so a rapid follow-up doesn't require reaching for the mouse.
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [value, disabled, onSend])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends, Shift+Enter inserts a newline — the convention for chat inputs.
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        submit()
        return
      }
      // Escape stops the current turn without losing what's been typed.
      if (event.key === 'Escape' && isBusy) {
        event.preventDefault()
        onInterrupt()
      }
    },
    [submit, isBusy, onInterrupt],
  )

  return (
    <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
      <div className="mx-auto w-full max-w-[calc(var(--measure)+8rem)]">
        <div
          className={cn(
            'flex items-end gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2',
            'transition-colors focus-within:border-accent',
            disabled && 'opacity-50',
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={isBusy ? 'Queue a follow-up…' : 'Send a message…'}
            aria-label="Message"
            className="flex-1 resize-none border-none bg-transparent py-1 text-sm text-text
                       outline-none placeholder:text-text-faint"
          />

          {isBusy ? (
            <Button
              variant="subtle"
              size="icon-lg"
              onClick={onInterrupt}
              aria-label="Stop generating"
              title="Stop (Esc)"
            >
              <Square size={13} className="fill-current" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="icon-lg"
              onClick={submit}
              disabled={!value.trim() || disabled}
              aria-label="Send message"
              title="Send (Enter)"
            >
              <CornerDownLeft size={14} />
            </Button>
          )}
        </div>

        <div className="mt-1.5 px-1 text-[10px] text-text-faint">
          <kbd className="font-mono">Enter</kbd> to send ·{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for newline
          {isBusy ? (
            <>
              {' '}
              · <kbd className="font-mono">Esc</kbd> to stop
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
