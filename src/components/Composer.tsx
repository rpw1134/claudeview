import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowUp, RefreshCw, Square } from 'lucide-react'
import type { SessionStatus } from '@shared/ipc'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/** Cap before the textarea scrolls internally. On the 8pt scale. */
const MAX_HEIGHT_PX = 192
/** Single-row height. Matches the send button exactly — see the note below. */
const MIN_HEIGHT_PX = 36

/**
 * Message input.
 *
 * ## The vertical alignment
 *
 * The old version looked visibly off: text sat closer to the bottom edge than the
 * top. The cause was a height mismatch — a 36px button and a ~30px single-row
 * textarea inside an `items-end` row. The button drove the row height, the shorter
 * textarea was pinned to the bottom, and the leftover space all collected above it.
 *
 * The fix is to make the two the same height rather than to nudge padding:
 * `line-height: 20px + 8px padding × 2 = 36px`, which equals the button's `h-9`.
 * Both children are then exactly 8px (the shell's padding) from every shell edge,
 * so the optical spacing is symmetric on all four sides.
 *
 * ## One boundary, not three
 *
 * The shell carries the only border in this region. The old version had a border
 * on the wrapper *and* the shell, which read as a box inside a box. The wrapper now
 * separates itself with a fill change plus a single hairline rule.
 */
export function Composer({
  status,
  onSend,
  onInterrupt,
  onReconnect,
  error,
}: {
  status: SessionStatus
  onSend: (text: string) => void
  onInterrupt: () => void
  onReconnect: () => void
  error?: string
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isBusy = status === 'thinking' || status === 'streaming' || status === 'tool'
  /**
   * The session is over — the subprocess exited, or startup failed.
   *
   * Previously this just disabled the input, which left the tab looking broken with
   * no explanation and no way back. Now it says what happened and offers a restart,
   * so an ended session is a recoverable state rather than a dead tab.
   */
  const isEnded = status === 'closed' || status === 'error'
  const disabled = isEnded

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(Math.max(element.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX)}px`
  }, [value])

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [value, disabled, onSend])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        submit()
        return
      }
      if (event.key === 'Escape' && isBusy) {
        event.preventDefault()
        onInterrupt()
      }
    },
    [submit, isBusy, onInterrupt],
  )

  const canSend = value.trim().length > 0 && !disabled

  if (isEnded) {
    return (
      <div className="shrink-0 border-t border-line bg-surface py-4">
        <div className="mx-auto w-full max-w-[calc(var(--measure)+8rem)] px-8">
          <div className="flex items-center gap-4 rounded-xl bg-raised px-4 py-3">
            <AlertCircle
              size={16}
              className={cn('shrink-0', status === 'error' ? 'text-danger' : 'text-text-faint')}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text">
                {status === 'error' ? 'This session hit an error.' : 'This session has ended.'}
              </p>
              <p className="mt-1 truncate text-xs text-text-faint">
                {error ?? 'Reconnecting resumes the conversation where it left off.'}
              </p>
            </div>
            <Button variant="primary" size="lg" onClick={onReconnect} className="shrink-0">
              <RefreshCw size={14} />
              Reconnect
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface py-4">
      {/*
        Padding sits on the max-width box, not the full-width wrapper — exactly as
        in Transcript. Putting it on the wrapper instead makes this box 32px wider
        per side than the prose column, so the input visibly fails to line up with
        the text above it.
      */}
      <div className="mx-auto w-full max-w-[calc(var(--measure)+8rem)] px-8">
        {/*
          `items-end` keeps the button on the last line as the textarea grows.
          Shell padding is a uniform 8px; both children are 36px tall at rest.
        */}
        <div
          className={cn(
            'flex items-end gap-2 rounded-xl border p-2 transition-colors duration-150',
            'bg-raised',
            // A real control boundary, so it clears the 3:1 non-text threshold.
            'border-line-strong focus-within:border-accent',
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
            style={{ minHeight: MIN_HEIGHT_PX }}
            className="flex-1 resize-none border-none bg-transparent px-2 py-2 text-[0.95rem]
                       leading-5 text-text outline-none placeholder:text-text-faint"
          />

          {isBusy ? (
            <Button
              variant="subtle"
              size="icon-lg"
              onClick={onInterrupt}
              aria-label="Stop generating"
              title="Stop (Esc)"
            >
              <Square size={12} className="fill-current" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="icon-lg"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send (Enter)"
            >
              <ArrowUp size={16} />
            </Button>
          )}
        </div>

        <p className="mt-2 px-4 text-xs text-text-faint">
          <kbd className="font-mono">Enter</kbd> to send ·{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for newline
          {isBusy ? (
            <>
              {' · '}
              <kbd className="font-mono">Esc</kbd> to stop
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}
