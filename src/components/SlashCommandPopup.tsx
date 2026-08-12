import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Eight rows is about a screenful of glance; past that you should keep typing. */
const MAX_VISIBLE = 8
const ROW_HEIGHT_PX = 28

/**
 * Command completions, above the composer.
 *
 * ## Why it looks like almost nothing
 *
 * It appears while you are mid-keystroke, directly over the transcript you were
 * just reading, so it owes the screen restraint: one fill (`bg-overlay`), one
 * hairline (`ring-line`), and no per-row box — the selected row is a wash of accent
 * and nothing else is drawn at all. A bordered list of bordered rows floating over
 * a bordered composer is three frames to parse for a menu that lives for a second.
 *
 * Names are mono because they are literal strings you are about to type, and the
 * eye scans a column of them far faster when the stems line up.
 *
 * Sized to the composer (`inset-x-0` in its relative wrapper) rather than to its
 * content: a menu that changes width as you type moves the very rows you're aiming
 * at, and the composer's edges are already where your attention is.
 */
export function SlashCommandPopup({
  commands,
  selected,
  onSelect,
  onHover,
  listId,
  optionId,
}: {
  commands: string[]
  selected: number
  /** Click-to-accept. Keyboard acceptance is owned by the composer's keydown. */
  onSelect: (name: string) => void
  onHover: (index: number) => void
  listId: string
  optionId: (index: number) => string
}) {
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the keyboard selection in view when the list overflows. Without this,
  // arrowing past the eighth match moves a highlight nobody can see.
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label="Slash commands"
      style={{ maxHeight: MAX_VISIBLE * ROW_HEIGHT_PX }}
      className="hand-1 absolute inset-x-0 bottom-full z-20 mb-2 overflow-y-auto bg-overlay p-1
                 shadow-lg ring-1 ring-line"
    >
      {commands.map((command, index) => (
        <li
          key={command}
          id={optionId(index)}
          role="option"
          aria-selected={index === selected}
          // The textarea keeps focus throughout, so the pointer must not steal it —
          // a mousedown that blurs the input loses the caret position the accept
          // depends on.
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(command)
          }}
          onMouseMove={() => onHover(index)}
          className={cn(
            'hand-sm-1 flex h-7 cursor-default items-center px-2 font-mono text-xs',
            index === selected ? 'bg-accent-wash text-text' : 'text-text-muted',
          )}
        >
          /{command}
        </li>
      ))}
    </ul>
  )
}
