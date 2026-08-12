import { useCallback, useEffect, useId, useState } from 'react'
import { activeSlashToken, applySlashCommand, matchSlashCommands } from '@/lib/slashCommands'

/**
 * The composer's slash-completion state machine.
 *
 * Extracted from `PanelComposer` because it is the only stateful thing in that
 * component that isn't about the text itself: a caret position, a selection index,
 * and a dismissal — three pieces of bookkeeping that would otherwise be interleaved
 * with drag counters and autosize effects in one file.
 *
 * The keyboard contract it enforces is the whole point of it existing:
 * **Enter means send unless this popup is open with a selection.** Anything less
 * precise makes the most-used key in the app conditional on state the user can't
 * see, which is how a completion menu ends up swallowing messages.
 */
export function useSlashCompletion({
  draft,
  commands,
  textareaRef,
  setDraft,
}: {
  draft: string
  commands: string[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  setDraft: (next: string) => void
}) {
  const [caret, setCaret] = useState(0)
  const [selected, setSelected] = useState(0)
  /**
   * The draft Escape was pressed on. Comparing against the live draft — rather
   * than holding a boolean — is what makes dismissal apply to *this* token and
   * lift the moment you type another character, with no flag to reset.
   */
  const [dismissedDraft, setDismissedDraft] = useState<string | null>(null)
  const listId = useId()

  const token = commands.length > 0 ? activeSlashToken(draft, caret) : null
  const matches = token ? matchSlashCommands(commands, token.query) : []
  const open = matches.length > 0 && draft !== dismissedDraft
  const index = selected < matches.length ? selected : 0

  // A narrower query is a different set of candidates, so a stale index would
  // leave the highlight on a row that only coincidentally still exists.
  const query = token?.query
  useEffect(() => setSelected(0), [query])

  /** Mirror the DOM caret into state; the popup's visibility depends on it. */
  const syncCaret = useCallback(() => {
    setCaret(textareaRef.current?.selectionStart ?? 0)
  }, [textareaRef])

  const accept = useCallback(
    (name: string) => {
      const current = activeSlashToken(draft, textareaRef.current?.selectionStart ?? caret)
      if (!current) return
      const next = applySlashCommand(draft, current, name)
      setDraft(next.text)
      // After React has written the new value: setting the range before the commit
      // would place the caret in the old string and be overwritten anyway.
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(next.caret, next.caret)
        setCaret(next.caret)
      })
    },
    [caret, draft, setDraft, textareaRef],
  )

  /** Returns true when the popup consumed the key and the composer must not act. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open) return false

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : matches.length - 1
        setSelected((current) => ((current < matches.length ? current : 0) + step) % matches.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        accept(matches[index]!)
        return true
      }
      if (event.key === 'Escape') {
        setDismissedDraft(draft)
        return true
      }
      return false
    },
    [accept, draft, index, matches, open],
  )

  return {
    open,
    matches,
    selected: index,
    setSelected,
    accept,
    onKeyDown,
    syncCaret,
    listId,
    optionId: (position: number) => `${listId}-${position}`,
  }
}
