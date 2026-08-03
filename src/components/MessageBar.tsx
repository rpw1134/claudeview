import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, CornerDownLeft, Square, SquareTerminal } from 'lucide-react'
import type { SessionStatus } from '@shared/ipc'
import type { Panel } from '@/stores/workspaceStore'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

const MAX_HEIGHT_PX = 192
/** Single-row height, matched exactly to the button so padding stays symmetric. */
const MIN_HEIGHT_PX = 36

/**
 * The one input for the whole window.
 *
 * ## Why a single bar rather than one per panel
 *
 * With up to eight panels, a per-panel composer means up to eight text fields, and
 * no way to tell at a glance which one has your keystrokes. A single bar bound to
 * the focused panel keeps input unambiguous: there is exactly one place to type,
 * and it says where the text is going.
 *
 * ## It retargets, and says so
 *
 * The bar reads the focused panel and changes accordingly:
 *
 *   session  -> sends a message; shows the session's status; Esc interrupts
 *   terminal -> writes the line plus a newline to the PTY, like typing a command
 *
 * The label and the send glyph both change, so the target is legible without
 * looking away at the panel ring. Draft text is kept per panel, so switching panels
 * mid-sentence doesn't discard what you typed.
 */
export function MessageBar({
  panel,
  status,
  onSendMessage,
  onRunCommand,
  onInterrupt,
}: {
  panel: Panel | null
  /** Status of the focused session panel; ignored for terminals. */
  status: SessionStatus | null
  onSendMessage: (tabId: string, text: string) => void
  onRunCommand: (terminalId: string, text: string) => void
  onInterrupt: (tabId: string) => void
}) {
  /** Draft text per panel id, so switching panels doesn't lose a half-typed line. */
  const draftsRef = useRef<Map<string, string>>(new Map())
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelId = panel?.id ?? null
  const previousPanelId = useRef<string | null>(null)

  // Swap drafts when the focused panel changes.
  useEffect(() => {
    const previous = previousPanelId.current
    if (previous && previous !== panelId) draftsRef.current.set(previous, value)
    if (panelId !== previous) setValue(panelId ? (draftsRef.current.get(panelId) ?? '') : '')
    previousPanelId.current = panelId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(Math.max(element.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX)}px`
  }, [value])

  const isTerminal = panel?.kind === 'terminal'
  const isBusy = !isTerminal && (status === 'thinking' || status === 'streaming' || status === 'tool')
  const disabled = !panel

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || !panel) return

    if (panel.kind === 'terminal') onRunCommand(panel.refId, text)
    else onSendMessage(panel.refId, text)

    setValue('')
    draftsRef.current.delete(panel.id)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [value, panel, onRunCommand, onSendMessage])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        submit()
        return
      }
      if (event.key === 'Escape' && isBusy && panel) {
        event.preventDefault()
        onInterrupt(panel.refId)
      }
    },
    [submit, isBusy, panel, onInterrupt],
  )

  const placeholder = !panel
    ? 'Open a panel to get started'
    : isTerminal
      ? `Run a command in ${panel.title}…`
      : isBusy
        ? 'Queue a follow-up…'
        : `Message ${panel.title}…`

  return (
    <div className="shrink-0 border-t border-line bg-surface py-3">
      <div className="mx-auto w-full max-w-[calc(var(--measure)+12rem)] px-4">
        <div
          data-focus-host
          className={cn(
            'flex items-end gap-2 rounded-xl border p-2 transition-colors duration-150',
            'bg-raised border-line-strong focus-within:border-accent',
            disabled && 'opacity-50',
          )}
        >
          {/* Target indicator. Terminals get a distinct glyph so the mode is
              obvious even before reading the placeholder. */}
          <span
            className="flex h-9 shrink-0 items-center pl-1 text-text-faint"
            aria-hidden
            title={isTerminal ? 'Sending to terminal' : 'Sending to session'}
          >
            {isTerminal ? <SquareTerminal size={15} /> : <CornerDownLeft size={15} />}
          </span>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={placeholder}
            aria-label={isTerminal ? 'Terminal command' : 'Message'}
            style={{ minHeight: MIN_HEIGHT_PX }}
            className={cn(
              'flex-1 resize-none border-none bg-transparent px-1 py-2 text-[0.95rem]',
              'leading-5 text-text outline-none placeholder:text-text-faint',
              isTerminal && 'font-mono text-sm',
            )}
          />

          {isBusy ? (
            <Button
              variant="subtle"
              size="icon-lg"
              onClick={() => panel && onInterrupt(panel.refId)}
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
              disabled={!value.trim() || disabled}
              aria-label={isTerminal ? 'Run command' : 'Send message'}
              title={isTerminal ? 'Run (Enter)' : 'Send (Enter)'}
              className="focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ArrowUp size={16} />
            </Button>
          )}
        </div>

        <p className="mt-2 px-2 text-xs text-text-faint">
          <kbd className="font-mono">Enter</kbd> to {isTerminal ? 'run' : 'send'} ·{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for newline
          {isBusy ? (
            <>
              {' · '}
              <kbd className="font-mono">Esc</kbd> to stop
            </>
          ) : null}
          {isTerminal ? ' · type directly in the panel for interactive programs' : ''}
        </p>
      </div>
    </div>
  )
}
