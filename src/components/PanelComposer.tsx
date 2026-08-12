import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Folder, FileText, Paperclip, Square, X } from 'lucide-react'
import { PermissionMenu } from './PermissionMenu'
import { SlashCommandPopup } from './SlashCommandPopup'
import { isBusyStatus } from './ActivityIndicator'
import type { PermissionMode, SessionStatus } from '@shared/ipc'
import { api } from '@/lib/api'
import { basename, composeMessage, mergeAttachments } from '@/lib/attachments'
import { useSlashCompletion } from '@/lib/useSlashCompletion'
import { cn } from '@/lib/utils'

const MAX_HEIGHT_PX = 120
const MIN_HEIGHT_PX = 28
/** Attachments are path references, not uploads, so the cap is about legibility. */
const MAX_ATTACHMENTS = 20

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
 * ## Width follows the panel, not the window
 *
 * A composer stretched edge to edge looks unfinished in a wide panel and cramped in
 * a narrow one — and the panel's width has nothing to do with the window's once you
 * can split eight ways. So the spacing is driven by `@container` queries against the
 * panel: a full-width panel gets generous inset and caps at the transcript's reading
 * measure, so the input lines up with the prose above it; a one-eighth panel
 * collapses to a tight 8px gutter. Same component, three densities.
 *
 * ## Deliberately understated
 *
 * With up to eight of these on screen the old treatment — a full-width bordered
 * shell, a solid accent send button, two lines of keyboard hints — would tile into
 * eight competing focal points. This is a quiet filled row with no border at rest, a
 * send button that only appears once there's something to send, and no hint text.
 * The focused panel's header icon already says which panel is live, so this only
 * lifts slightly on focus rather than announcing itself again.
 */
export function PanelComposer({
  status,
  permissionMode,
  panelFocused,
  autoFocusToken,
  draft,
  draftAttachments,
  slashCommands,
  onDraftChange,
  onSend,
  onInterrupt,
  onPermissionModeChange,
}: {
  status: SessionStatus
  permissionMode: PermissionMode
  panelFocused: boolean
  /**
   * Commands this session accepts, from `session-init`. Absent for a composer with
   * no session behind it (the pending panel), which is exactly the case where
   * completions would be a menu of guesses.
   */
  slashCommands?: string[]
  /**
   * The unsent message, owned by the tab. Not local state: this component
   * unmounts whenever the layout tree changes shape, which used to throw away
   * whatever you'd typed.
   */
  draft: string
  draftAttachments: string[]
  onDraftChange: (draft: string, attachments: string[]) => void
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
  const value = draft
  const attachments = draftAttachments
  const setValue = useCallback(
    (next: string | ((current: string) => string)) =>
      onDraftChange(typeof next === 'function' ? next(draft) : next, draftAttachments),
    [draft, draftAttachments, onDraftChange],
  )
  const setAttachments = useCallback(
    (next: string[] | ((current: string[]) => string[])) =>
      onDraftChange(draft, typeof next === 'function' ? next(draftAttachments) : next),
    [draft, draftAttachments, onDraftChange],
  )

  const [dropActive, setDropActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Drag events fire for every child element crossing the pointer, so a plain
  // enter/leave pair flickers. Counting depth is the standard fix.
  const dragDepth = useRef(0)

  const slash = useSlashCompletion({
    draft: value,
    commands: slashCommands ?? [],
    textareaRef,
    setDraft: setValue,
  })

  /*
   * Colour the whole field while the draft is a bare command token.
   *
   * The alternative — a mirror div behind a transparent textarea — is the only way
   * to tint *part* of the text, and it is a standing bug factory: the mirror has to
   * reproduce the textarea's font, padding, wrapping and scroll offset exactly, and
   * any drift shows up as visibly doubled or offset glyphs while you type. This
   * says the same thing ("that's a command") with one class and nothing to
   * desynchronise, and it stops being true at precisely the moment it would start
   * lying — the first space, after which the line is a command *plus arguments*
   * and colouring the arguments would be wrong anyway.
   */
  const isBareCommand = /^\/\S*$/.test(value)

  const isBusy = isBusyStatus(status)
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

  const addAttachments = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return
      setAttachments((existing) => mergeAttachments(existing, paths, MAX_ATTACHMENTS))
      textareaRef.current?.focus()
    },
    [setAttachments],
  )

  const pickAttachments = useCallback(
    async (directories: boolean) => {
      addAttachments(await api['app:pick-attachments']({ directories }))
    },
    [addAttachments],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      dragDepth.current = 0
      setDropActive(false)
      if (disabled) return

      const files = Array.from(event.dataTransfer.files)
      if (files.length > 0) {
        // Resolved in the preload bridge: `File.path` was removed in Electron 32,
        // so the real path has to be requested for each dropped file explicitly.
        addAttachments(api.resolveDroppedPaths(files))
        return
      }

      // Dragging text (a path from a terminal, a snippet from the transcript)
      // inserts rather than attaches — it isn't a file reference.
      const text = event.dataTransfer.getData('text/plain')
      if (text) setValue((current) => (current ? `${current} ${text}` : text))
    },
    [addAttachments, disabled],
  )

  const submit = useCallback(() => {
    const text = value.trim()
    if ((!text && attachments.length === 0) || disabled) return

    // The store clears the draft as part of sending; clearing here too would race
    // with anything typed in between.
    onSend(composeMessage(text, attachments))
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [value, attachments, disabled, onSend])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // First refusal to the completion popup: while it's open, Enter and Tab
      // belong to it. Every other time — including the frame after Escape closes
      // it — Enter still sends, which is the contract this ordering guarantees.
      if (!event.nativeEvent.isComposing && slash.onKeyDown(event)) {
        event.preventDefault()
        return
      }
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
    [slash, submit, isBusy, onInterrupt],
  )

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled

  return (
    <div className="shrink-0">
      {/*
        Full width, matching the transcript's gutters exactly — no centring and no
        measure cap. The transcript is a left-aligned rail now, so a composer
        centred on a narrower box would sit visibly off-axis from the conversation
        it belongs to.
      */}
      <div className="w-full px-4 pb-4 @[30rem]:px-7 @[48rem]:px-10 @[48rem]:pb-5">
        <div
          data-focus-host
          onDragEnter={(event) => {
            event.preventDefault()
            dragDepth.current += 1
            if (!disabled) setDropActive(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => {
            dragDepth.current -= 1
            if (dragDepth.current <= 0) setDropActive(false)
          }}
          onDrop={onDrop}
          className={cn(
            // `relative` anchors the completion popup to the input's own edges: it
            // is a menu *of* this field, and any other width reads as unrelated.
            'hand-2 relative transition-colors duration-150',
            // No border at rest. The panel's header icon already says which one is
            // live; a second outline per panel is what made eight of these loud.
            panelFocused ? 'bg-raised' : 'bg-raised/60',
            'focus-within:bg-raised focus-within:ring-1 focus-within:ring-accent/40',
            dropActive && 'ring-1 ring-accent',
            disabled && 'opacity-50',
          )}
        >
          {slash.open ? (
            <SlashCommandPopup
              commands={slash.matches}
              selected={slash.selected}
              onSelect={slash.accept}
              onHover={slash.setSelected}
              listId={slash.listId}
              optionId={slash.optionId}
            />
          ) : null}

          {attachments.length > 0 ? (
            <AttachmentChips
              paths={attachments}
              onRemove={(path) =>
                setAttachments((existing) => existing.filter((entry) => entry !== path))
              }
            />
          ) : null}

          {/*
            Two rows, not one.

            The old single row interleaved controls with the text — permission
            select, paperclip, textarea, send — so the input started a third of the
            way across and the eye had to step over two widgets to reach the thing
            it was there to use. Splitting them gives the message the full width and
            puts every control on one baseline, all on the right, in the order you'd
            reach for them: what it's allowed to do, what's attached, then send.
          */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              slash.syncCaret()
            }}
            // Fires on every caret move, which is what decides whether the caret is
            // still inside the command token — arrowing out of it closes the popup.
            onSelect={slash.syncCaret}
            onKeyDown={onKeyDown}
            disabled={disabled}
            rows={1}
            role="combobox"
            aria-expanded={slash.open}
            aria-autocomplete="list"
            aria-controls={slash.open ? slash.listId : undefined}
            aria-activedescendant={slash.open ? slash.optionId(slash.selected) : undefined}
            placeholder={
              disabled ? 'Session ended' : isBusy ? 'Add to the pile…' : 'Write something…'
            }
            aria-label="Message"
            style={{ minHeight: MIN_HEIGHT_PX }}
            className={cn(
              `w-full resize-none border-none bg-transparent px-3 pt-2.5 text-sm
               leading-relaxed outline-none placeholder:text-text-faint`,
              isBareCommand ? 'text-accent' : 'text-text',
            )}
          />

          <div className="flex items-center justify-end gap-1 px-2 pb-1.5">
            <PermissionMenu
              value={permissionMode}
              disabled={disabled}
              onChange={onPermissionModeChange}
            />

            <button
              // Alt opens the folder picker. macOS won't offer files and folders in
              // one panel without the selection rules going ambiguous, so the two
              // are separate dialogs — and dragging a folder in works either way.
              onClick={(event) => void pickAttachments(event.altKey)}
              disabled={disabled}
              aria-label="Attach files"
              title="Attach files (⌥ for folders, or drop them here)"
              className="hand-sm-1 flex h-7 w-7 shrink-0 items-center justify-center
                         text-text-faint transition-colors hover:bg-overlay hover:text-text-muted
                         disabled:pointer-events-none disabled:opacity-50"
            >
              <Paperclip size={14} />
            </button>

            {/* Only present when it has something to do. An always-visible solid
                button per panel is a row of accent blocks competing for attention. */}
            {isBusy ? (
              <button
                onClick={onInterrupt}
                aria-label="Stop generating"
                title="Stop (Esc)"
                className="hand-sm-2 flex h-7 w-7 shrink-0 items-center justify-center
                           text-text-muted transition-colors hover:bg-overlay hover:text-text"
              >
                <Square size={11} className="fill-current" />
              </button>
            ) : canSend ? (
              <button
                onClick={submit}
                aria-label="Send message"
                title="Send (Enter)"
                className="hand-sm-2 flex h-7 w-7 shrink-0 items-center justify-center
                           bg-accent text-accent-contrast transition-opacity hover:opacity-90"
              >
                <ArrowUp size={13} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Attached paths, as removable chips above the input.
 *
 * Basename only — a column of absolute paths in a narrow panel is unreadable and
 * wraps the composer to three lines. The full path is the tooltip, and it's in the
 * message the agent receives either way.
 */
export function AttachmentChips({
  paths,
  onRemove,
}: {
  paths: string[]
  onRemove: (path: string) => void
}) {
  return (
    <ul className="flex flex-wrap gap-1 px-1.5 pb-0.5 pt-1.5">
      {paths.map((path) => {
        const isDirectory = !basename(path).includes('.')
        const Icon = isDirectory ? Folder : FileText

        return (
          <li key={path}>
            <span
              title={path}
              className="hand-sm-1 flex h-6 items-center gap-1.5 bg-overlay pl-1.5 pr-1
                         text-xs text-text-muted"
            >
              <Icon size={11} className="shrink-0 text-text-faint" aria-hidden />
              <span className="max-w-40 truncate">{basename(path)}</span>
              <button
                onClick={() => onRemove(path)}
                aria-label={`Remove ${basename(path)}`}
                className="rounded-sm p-0.5 text-text-faint transition-colors hover:text-text"
              >
                <X size={10} />
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

