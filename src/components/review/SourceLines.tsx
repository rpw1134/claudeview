import { Fragment, useCallback, useMemo } from 'react'
import type { ReviewLineMark } from '@shared/ipc'
import type { ReviewComment } from '@/stores/reviewStore'
import { CodeLine } from './CodeLine'
import { CommentComposer } from './CommentComposer'
import { CommentRow } from './CommentRow'
import { MAX_LINES, type HighlightedFile } from './highlight'
import { useGutterSelection } from './useGutterSelection'
import type { Reveal } from './useSplitSync'

/**
 * The line-numbered source column: gutter marks, drag selection, inline comments.
 *
 * Lifted out of `ReviewCodePane` unchanged when markdown gained a preview. The pane
 * now decides which column(s) to show and owns the state the two columns *share*
 * (comment visibility, per-line collapse); this owns only what is true of a line
 * grid — the drag selection, in `useGutterSelection`.
 *
 * Everything about how a single line reads is documented on `CodeLine`.
 */
export function SourceLines({
  highlighted,
  lineKinds,
  comments,
  commentsVisible,
  collapsedLines,
  reveal,
  onSetLinesCollapsed,
  onAddComment,
  onToggleResolved,
  onDeleteComment,
  onRevealLine,
  scrollRef,
}: {
  highlighted: HighlightedFile
  lineKinds: Map<number, ReviewLineMark['kind']>
  comments: ReviewComment[]
  commentsVisible: boolean
  collapsedLines: Set<number>
  /** A line the preview pane is pointing at. */
  reveal?: Reveal
  onSetLinesCollapsed: (lines: number[], collapsed: boolean) => void
  onAddComment: (input: { startLine: number; endLine: number; text: string }) => void
  onToggleResolved: (id: string) => void
  onDeleteComment: (id: string) => void
  /** Split mode only: point the preview pane at this line. */
  onRevealLine?: (line: number) => void
  scrollRef?: React.Ref<HTMLDivElement>
}) {
  const { range, clear, onGutterMouseDown, onGutterMouseEnter } = useGutterSelection()

  const commentsByLine = useMemo(() => {
    const byLine = new Map<number, ReviewComment[]>()
    for (const comment of comments) {
      const bucket = byLine.get(comment.endLine)
      if (bucket) bucket.push(comment)
      else byLine.set(comment.endLine, [comment])
    }
    return byLine
  }, [comments])

  const onToggleComments = useCallback(
    (line: number) => {
      onSetLinesCollapsed([line], !collapsedLines.has(line))
      onRevealLine?.(line)
    },
    [collapsedLines, onSetLinesCollapsed, onRevealLine],
  )

  /*
   * Comments whose line no longer exists.
   *
   * A comment records the file as it was when you wrote it, and the agent may have
   * since deleted those lines — or the line may be past the 5000-line cap. Anchoring
   * them to a line that isn't rendered would hide them while still sending them,
   * which is the worst of both. They collect at the bottom instead, labelled.
   */
  const orphans = comments.filter((comment) => comment.endLine > highlighted.lines.length)

  return (
    <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto py-2">
      {highlighted.lines.map((html, index) => {
        const number = index + 1
        const lineComments = commentsByLine.get(number)
        const composing = range?.end === number
        // A line defaults open the moment its comments become visible; a click
        // on its marker is the only thing that can remove it from that default.
        const showRows = commentsVisible && !collapsedLines.has(number) && !!lineComments

        return (
          <Fragment key={number}>
            <CodeLine
              number={number}
              html={html}
              kind={lineKinds.get(number)}
              selected={range !== null && number >= range.start && number <= range.end}
              revealed={reveal?.line === number}
              commentCount={lineComments?.length ?? 0}
              hasUnresolved={lineComments?.some((comment) => !comment.resolved) ?? false}
              commentsExpanded={showRows}
              onGutterMouseDown={onGutterMouseDown}
              onGutterMouseEnter={onGutterMouseEnter}
              onToggleComments={onToggleComments}
            />

            {showRows || composing ? (
              // `sticky left-0`: code rows are as wide as their longest line, so
              // a horizontally scrolled file would otherwise carry its comments
              // off to the left with the origin. The single hairline sits at the
              // gutter edge (`pl-14` on the outer, `pl-3` inside it, matching
              // `CodeLine`'s own gutter-to-text offset) rather than a drawn box.
              <div className="sticky left-0 min-w-0 pl-14 pr-4">
                <div className="space-y-1 border-l border-line py-1 pl-3">
                  {showRows
                    ? lineComments?.map((comment) => (
                        <CommentRow
                          key={comment.id}
                          comment={comment}
                          onToggleResolved={() => onToggleResolved(comment.id)}
                          onDelete={() => onDeleteComment(comment.id)}
                        />
                      ))
                    : null}
                  {composing && range ? (
                    <CommentComposer
                      startLine={range.start}
                      endLine={range.end}
                      onCancel={clear}
                      onSubmit={(text) => {
                        onAddComment({ startLine: range.start, endLine: range.end, text })
                        clear()
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </Fragment>
        )
      })}

      {commentsVisible && orphans.length > 0 ? (
        <div className="space-y-1 px-4 py-3">
          <p className="text-xs text-text-faint">Comments on lines that no longer exist</p>
          {orphans.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              onToggleResolved={() => onToggleResolved(comment.id)}
              onDelete={() => onDeleteComment(comment.id)}
              showMeta
            />
          ))}
        </div>
      ) : null}

      {highlighted.truncated ? (
        <p className="px-4 py-3 text-xs text-text-faint">
          Showing the first {MAX_LINES.toLocaleString()} lines of{' '}
          {highlighted.totalLines.toLocaleString()}.
        </p>
      ) : null}
    </div>
  )
}
