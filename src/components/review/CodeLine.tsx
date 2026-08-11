import { memo } from 'react'
import { MessageSquare } from 'lucide-react'
import type { ReviewLineMark } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { useRevealedRef } from './useSplitSync'

/**
 * One line of read-only code: number, change mark, source.
 *
 * ## The mark is the entire diff surface
 *
 * There is no red/green pane here and no before/after column. Two-column diffs
 * answer "what did version N look like", and that is not the question you have
 * when an agent has just rewritten a file — you want to read the code as it now
 * stands, with the changed lines findable. So the change is a 3px bar in the
 * gutter and nothing else: the code column reads exactly like an editor, and the
 * eye picks up the bars in peripheral vision while doing it.
 *
 * `added` takes the success hue and `modified` the accent, and neither is the only
 * carrier of its meaning — the pane header states the counts in text.
 *
 * ## The gutter is chrome, the code is content
 *
 * The number column carries its own `surface` fill and a hairline down its right
 * edge. Without that ground the numbers floated in the same plane as the source and
 * the eye had to re-decide, every line, which of the two it was reading.
 *
 * ## The `+` is CSS, not state
 *
 * Hovering a line reveals a `+` at the left of the gutter — the convention every
 * code host uses, and the thing that was missing when people couldn't find how to
 * comment at all. It is a `group-hover` opacity change and nothing else: a React
 * hover state here would re-render on every pointer move across a file of up to
 * five thousand rows, which is exactly what the memo below exists to prevent. The
 * glyph is a character rather than an icon component for the same reason — 5000
 * inline SVGs is a real cost, 5000 text nodes is not.
 *
 * It is inside the gutter cell rather than beside it, so it inherits the cell's
 * mousedown: clicking the `+` *is* clicking the line number, and it takes part in
 * shift-click and drag ranges without knowing they exist.
 *
 * ## The comment marker
 *
 * A fixed-width slot sits between the number cell and the mark bar, on every row,
 * whether or not the line has comments — reserving the width there rather than only
 * on rows that need it keeps the mark bar and the code column starting at the same
 * x on every line. Only lines with comments render a button into it: the
 * `MessageSquare` glyph, plus the count once there's more than one to distinguish
 * from a single unread note. Unlike the gutter cell, this button *is* a real tab
 * stop — it only exists on the handful of rows that have something to toggle, so it
 * never reproduces the "5000 tab stops" problem the gutter is written to avoid.
 * Colour carries resolution state (`text-accent` while unresolved, `text-faint`
 * once every comment on the line is resolved) but `aria-pressed` and the label are
 * the real signal for anyone not reading colour.
 *
 * ## The `dangerouslySetInnerHTML`
 *
 * `html` is hljs output, which escapes every character of the source and emits
 * only `<span class>`. See `highlight.ts` — a file's contents never reach the DOM
 * as markup.
 */
export const CodeLine = memo(function CodeLine({
  number,
  html,
  kind,
  selected,
  commentCount,
  hasUnresolved,
  commentsExpanded,
  revealed = false,
  onGutterMouseDown,
  onGutterMouseEnter,
  onToggleComments,
}: {
  number: number
  html: string
  kind: ReviewLineMark['kind'] | undefined
  selected: boolean
  /**
   * Split view is pointing at this line from the preview side. It wears the same
   * accent wash a selection does — one vocabulary for "this is the bit in question"
   * — and scrolls itself into view.
   */
  revealed?: boolean
  /** How many comments are anchored to this line — 0 renders no marker. */
  commentCount: number
  hasUnresolved: boolean
  /** Whether this line's comments are currently rendered below it. */
  commentsExpanded: boolean
  onGutterMouseDown: (line: number, shiftKey: boolean) => void
  onGutterMouseEnter: (line: number) => void
  onToggleComments: (line: number) => void
}) {
  const revealRef = useRevealedRef<HTMLDivElement>(revealed)

  return (
    // `w-max min-w-full`: a long line widens the row, and the scroll container
    // around the pane scrolls all of them together — otherwise each line would
    // clip independently and the code column would lose its right-hand content.
    //
    // Selection takes the accent wash, not a neutral fill. Selecting lines is an
    // *intent* — you are about to say something about them — and a raised grey
    // was indistinguishable from the hover state of a row you'd merely passed over.
    <div
      ref={revealRef}
      data-line={number}
      className={cn(
        'group flex w-max min-w-full items-stretch transition-colors',
        (selected || revealed) && 'bg-accent-wash',
      )}
    >
      {/*
        Line numbers are the selection handle, so the pointer target is the whole
        gutter cell rather than the digits. They are not in the tab order: five
        thousand tab stops in front of the code would make the pane unusable by
        keyboard, which is the opposite of the intent. Commenting without a mouse
        is a gap, and an honest one to record here rather than paper over.
      */}
      <div
        role="button"
        tabIndex={-1}
        aria-label={`Select line ${number}`}
        onMouseDown={(event) => {
          // Only the primary button, and never let the gutter start a text
          // selection — dragging down it selects lines, not characters.
          if (event.button !== 0) return
          event.preventDefault()
          onGutterMouseDown(number, event.shiftKey)
        }}
        onMouseEnter={() => onGutterMouseEnter(number)}
        className={cn(
          'relative w-14 shrink-0 cursor-pointer select-none border-r border-line pr-3',
          'text-right font-mono text-xs leading-5 tabular-nums transition-colors',
          // Transparent while selected so the row's wash runs unbroken through the
          // gutter — the selection is one band, not a code half and a chrome half.
          selected ? 'text-text' : 'bg-surface text-text-faint group-hover:text-text',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-0 leading-5 text-accent
                     opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          +
        </span>
        {number}
      </div>

      <div className="flex w-5 shrink-0 items-center justify-center">
        {commentCount > 0 ? (
          <button
            type="button"
            onClick={() => onToggleComments(number)}
            aria-pressed={commentsExpanded}
            aria-label={`${commentsExpanded ? 'Hide' : 'Show'} ${commentCount} comment${commentCount === 1 ? '' : 's'} on line ${number}`}
            title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
            className={cn(
              'flex items-center gap-0.5 leading-none tabular-nums transition-colors',
              'text-[10px] hover:text-text',
              hasUnresolved ? 'text-accent' : 'text-text-faint',
            )}
          >
            <MessageSquare size={11} />
            {commentCount > 1 ? commentCount : null}
          </button>
        ) : null}
      </div>

      <div
        aria-hidden
        className={cn(
          'w-[3px] shrink-0',
          kind === 'added' && 'bg-success',
          kind === 'modified' && 'bg-accent',
        )}
      />

      <pre
        data-selectable
        className="whitespace-pre pl-3 pr-4 font-mono text-[13px] leading-5 text-text"
        dangerouslySetInnerHTML={{ __html: html || ' ' }}
      />
    </div>
  )
})
