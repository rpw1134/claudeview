import { memo } from 'react'
import { MessageSquare } from 'lucide-react'
import type { ReviewLineMark } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { useRevealedRef } from './useSplitSync'

/**
 * One top-level markdown block, rendered, with the same gutter grammar as a line
 * of source.
 *
 * ## It is the same object in a different clothes
 *
 * Left to right this row is: comment affordance, comment marker, change bar,
 * content — exactly `CodeLine`'s order, at block scale instead of line scale. That
 * is the whole reason preview commenting feels like source commenting rather than a
 * second, differently-shaped feature: the `+` appears in the same place, the 3px
 * bar means the same thing, and comments hang below in the same hairline block.
 *
 * ## The `+` is a real button here
 *
 * In `CodeLine` the gutter is `tabIndex={-1}` because a five-thousand-line file
 * would put five thousand tab stops in front of the code. A document has tens of
 * blocks, not thousands, so here the affordance can be a proper focusable button —
 * which makes commenting in preview reachable from the keyboard, the one thing
 * source mode still can't offer. It stays visually hidden until hover or focus.
 *
 * ## The mark bar
 *
 * A block whose lines intersect any added/modified run gets the bar, so a changed
 * region stays findable when you are reading the rendered form. It is coarser than
 * source — the bar says "something in this paragraph changed", not "these two
 * lines" — which is the honest resolution a rendered view has.
 *
 * ## The `dangerouslySetInnerHTML`
 *
 * `html` comes from `renderMarkdown`, which is marked + DOMPurify with the app's
 * config (see `@/lib/markdown`). The prop *object* is passed in already-memoized
 * rather than built here: React 19 compares the object, not the string, so an
 * inline `{ __html }` would re-write innerHTML on every parent render and wipe the
 * highlighted code and rendered diagrams the post-render passes wrote into it.
 */
export const PreviewBlock = memo(function PreviewBlock({
  startLine,
  endLine,
  htmlProp,
  kind,
  selected,
  revealed = false,
  commentCount,
  hasUnresolved,
  commentsExpanded,
  onSelect,
  onToggleComments,
  children,
}: {
  startLine: number
  endLine: number
  /** Pre-memoized `{ __html }` — see the note above on why it isn't built here. */
  htmlProp: { __html: string }
  kind: ReviewLineMark['kind'] | undefined
  /** The composer is open on this block. */
  selected: boolean
  /** Split view is pointing at this block from the source side. */
  revealed?: boolean
  commentCount: number
  hasUnresolved: boolean
  commentsExpanded: boolean
  onSelect: (startLine: number, endLine: number) => void
  onToggleComments: (startLine: number, endLine: number) => void
  /** Comment rows and the composer, rendered beneath the block by the pane. */
  children?: React.ReactNode
}) {
  const range = startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`
  const revealRef = useRevealedRef<HTMLDivElement>(revealed)

  return (
    // The range is on the element as well as in the props: it is the one fact about
    // a rendered block that isn't visible in the rendered block, and having it in the
    // DOM is what makes "which lines is this paragraph?" answerable while inspecting.
    <div ref={revealRef} data-block-start={startLine} data-block-end={endLine}>
      <div
        className={cn(
          'group flex items-stretch transition-colors',
          (selected || revealed) && 'bg-accent-wash',
        )}
      >
        <div className="flex w-8 shrink-0 justify-center pt-1">
          <button
            type="button"
            onClick={() => onSelect(startLine, endLine)}
            aria-label={`Comment on ${range}`}
            title={`Comment on ${range}`}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-sm font-mono text-sm leading-none',
              'text-accent opacity-0 transition-opacity duration-150',
              'hover:bg-raised group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            +
          </button>
        </div>

        <div className="flex w-5 shrink-0 justify-center pt-1.5">
          {commentCount > 0 ? (
            <button
              type="button"
              onClick={() => onToggleComments(startLine, endLine)}
              aria-pressed={commentsExpanded}
              aria-label={`${commentsExpanded ? 'Hide' : 'Show'} ${commentCount} comment${commentCount === 1 ? '' : 's'} on ${range}`}
              title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
              className={cn(
                'flex items-center gap-0.5 self-start leading-none tabular-nums transition-colors',
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

        {/*
          `prose-stream` is the transcript's prose class, used here unchanged — the
          same markdown should not read two ways in one app. That includes line
          length: it is governed by `--measure` (Settings ▸ Line width), which
          defaults to unconstrained. A local cap here would have been this pane
          quietly disagreeing with a setting the user already made.
        */}
        <div className="min-w-0 flex-1 pl-3 pr-4">
          <div className="prose-stream" data-selectable dangerouslySetInnerHTML={htmlProp} />
        </div>
      </div>

      {children ? <div className="min-w-0 pl-16 pr-4">{children}</div> : null}
    </div>
  )
})
