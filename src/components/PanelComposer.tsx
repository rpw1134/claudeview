import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import type { PermissionMode, SessionStatus } from '@shared/ipc'
import { cn } from '@/lib/utils'

const MAX_HEIGHT_PX = 120
const MIN_HEIGHT_PX = 28

const PERMISSION_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'default', label: 'Ask' },
  { value: 'acceptEdits', label: 'Edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'dontAsk', label: 'No ask' },
  { value: 'bypassPermissions', label: 'Bypass' },
]

/**
 * The composer, living inside its own session panel.
 *
 * ## Why it moved out of the window chrome
 *
 * A single window-level bar had to retarget as focus moved, and the status strip
 * beside it only existed for sessions — so focusing a terminal removed a row and
 * shifted every panel. Putting input inside the panel it belongs to removes the
 * retargeting *and* the jitter: nothing at the window level changes when focus
 * moves, because there is nothing at the window level.
 *
 * ## Deliberately understated
 *
 * With up to eight of these on screen, each in a fraction of the window, the old
 * treatment — a full-width bordered shell, a solid accent send button, two lines of
 * keyboard hints — would tile into eight competing focal points. This is a quiet
 * filled row with no border at rest, a send button that only appears once there's
 * something to send, and no hint text. It states its presence and nothing more.
 *
 * The focused panel already carries the accent ring, so this only needs to lift
 * slightly on focus rather than announce itself again.
 */
export function PanelComposer({
  status,
  permissionMode,
  panelFocused,
  autoFocusToken,
  onSend,
  onInterrupt,
  onPermissionModeChange,
}: {
  status: SessionStatus
  permissionMode: PermissionMode
  panelFocused: boolean
  /**
   * Changes whenever the panel is focused *by keyboard*. Focusing the input is
   * keyed off this rather than off `panelFocused` so that clicking into the
   * transcript to select text doesn't yank the caret into the input.
   */
  autoFocusToken: number
  onSend: (text: string) => void
  onInterrupt: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isBusy = status === 'thinking' || status === 'streaming' || status === 'tool'
  const disabled = status === 'closed' || status === 'error'

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(Math.max(element.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX)}px`
  }, [value])

  // Focus on keyboard panel switches only. `autoFocusToken` increments per switch,
  // so repeated switches back to the same panel still re-focus.
  useEffect(() => {
    if (autoFocusToken > 0 && !disabled) textareaRef.current?.focus()
  }, [autoFocusToken, disabled])

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

  return (
    <div className="shrink-0 px-2 pb-2">
      <div
        data-focus-host
        className={cn(
          'flex items-end gap-1 rounded-md px-1.5 py-1 transition-colors duration-150',
          // No border at rest. The panel ring already says which one is live; a
          // second outline per panel is what made eight of these feel loud.
          panelFocused ? 'bg-raised' : 'bg-raised/50',
          'focus-within:bg-raised focus-within:ring-1 focus-within:ring-accent/50',
          disabled && 'opacity-50',
        )}
      >
        {/*
          Permission mode sits with the input rather than in a status strip: it
          governs what the agent may do to your machine, so it belongs where you
          commit an instruction, and it's the only per-session control small enough
          to live here.
        */}
        <select
          aria-label="Permission mode"
          value={permissionMode}
          onChange={(event) => onPermissionModeChange(event.target.value as PermissionMode)}
          disabled={disabled}
          className={cn(
            'h-6 shrink-0 rounded-sm border-none bg-transparent pl-1 pr-0 text-xs outline-none',
            permissionMode === 'bypassPermissions' || permissionMode === 'dontAsk'
              ? 'text-warning'
              : 'text-text-faint hover:text-text-muted',
          )}
        >
          {PERMISSION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled ? 'Session ended' : isBusy ? 'Queue a follow-up…' : 'Message…'
          }
          aria-label="Message"
          style={{ minHeight: MIN_HEIGHT_PX }}
          className="flex-1 resize-none border-none bg-transparent px-1 py-1 text-sm leading-5
                     text-text outline-none placeholder:text-text-faint"
        />

        {/* Only present when it has something to do. An always-visible solid
            button per panel is a row of accent blocks competing for attention. */}
        {isBusy ? (
          <button
            onClick={onInterrupt}
            aria-label="Stop generating"
            title="Stop (Esc)"
            className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm
                       text-text-muted transition-colors hover:bg-overlay hover:text-text"
          >
            <Square size={10} className="fill-current" />
          </button>
        ) : canSend ? (
          <button
            onClick={submit}
            aria-label="Send message"
            title="Send (Enter)"
            className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm
                       bg-accent text-accent-contrast transition-opacity hover:opacity-90"
          >
            <ArrowUp size={12} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
