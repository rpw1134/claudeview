import { useEffect, useRef } from 'react'
import type { ReviewLineMark } from '@shared/ipc'
import { highlightCodeBlocks, renderMermaidBlocks } from '@/lib/markdown'
import type { ReviewComment } from '@/stores/reviewStore'
import { CommentComposer } from './CommentComposer'
import { CommentRow } from './CommentRow'
import { rangesOverlap } from './markdownBlocks'
import { PreviewBlock } from './PreviewBlock'
import { usePreviewBlocks } from './usePreviewBlocks'
import type { Reveal } from './useSplitSync'

/**
 * The rendered half of a markdown review: prose you can comment on.
 *
 * The document is a sequence of top-level blocks rather than one `innerHTML`,
 * because every comment here is a line range on the file — see `markdownBlocks` for
 * how a block learns which lines it came from, and `usePreviewBlocks` for what is
 * derived from that.
 *
 * `highlightCodeBlocks` and `renderMermaidBlocks` run once over the whole preview
 * root, exactly as the transcript runs them (see `StreamingMarkdown`). Both are
 * idempotent and mark what they've handled, so re-running on a content change only
 * touches new blocks. They mutate the DOM under React, which is safe only because
 * the `__html` prop objects are memoized on the html string — React never rewrites a
 * subtree whose content didn't change, so their work survives.
 */
export function MarkdownPreview({
  content,
  lineKinds,
  comments,
  commentsVisible,
  collapsedLines,
  composing,
  reveal,
  onCompose,
  onCancelCompose,
  onSubmitComment,
  onSetLinesCollapsed,
  onToggleResolved,
  onDeleteComment,
  onRevealLine,
  scrollRef,
}: {
  content: string
  lineKinds: Map<number, ReviewLineMark['kind']>
  comments: ReviewComment[]
  commentsVisible: boolean
  collapsedLines: Set<number>
  /** The block range the composer is open on, if any. */
  composing: { startLine: number; endLine: number } | null
  /** A source line the other pane is pointing at. */
  reveal?: Reveal
  onCompose: (range: { startLine: number; endLine: number }) => void
  onCancelCompose: () => void
  onSubmitComment: (input: { startLine: number; endLine: number; text: string }) => void
  onSetLinesCollapsed: (lines: number[], collapsed: boolean) => void
  onToggleResolved: (id: string) => void
  onDeleteComment: (id: string) => void
  /** Split mode only: point the source pane at this line. */
  onRevealLine?: (line: number) => void
  scrollRef?: React.Ref<HTMLDivElement>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { blocks, rendered, byBlock, orphans, kinds } = usePreviewBlocks(
    content,
    comments,
    lineKinds,
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    highlightCodeBlocks(root)
    // Fire-and-forget, like the transcript: nothing waits on a diagram, and a
    // failure leaves the escaped source on screen.
    void renderMermaidBlocks(root)
  }, [rendered])

  if (blocks.length === 0) {
    return (
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        <p className="px-4 py-3 text-sm text-text-faint">Nothing to preview.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto py-2">
      <div ref={rootRef}>
        {blocks.map((block, index) => {
          const blockComments = byBlock.get(index)
          const shown = blockComments?.filter((comment) => !collapsedLines.has(comment.endLine))
          const showRows = commentsVisible && !!shown && shown.length > 0
          const isComposing =
            composing?.startLine === block.startLine && composing.endLine === block.endLine

          return (
            <PreviewBlock
              key={`${index}-${block.startLine}`}
              startLine={block.startLine}
              endLine={block.endLine}
              htmlProp={rendered[index] ?? EMPTY_HTML}
              kind={kinds.get(index)}
              selected={isComposing}
              revealed={
                reveal !== null &&
                reveal !== undefined &&
                rangesOverlap(block, { startLine: reveal.line, endLine: reveal.line })
              }
              commentCount={blockComments?.length ?? 0}
              hasUnresolved={blockComments?.some((comment) => !comment.resolved) ?? false}
              commentsExpanded={showRows}
              onSelect={(startLine, endLine) => onCompose({ startLine, endLine })}
              onToggleComments={() => {
                if (!blockComments) return
                /*
                 * One click, one outcome for the whole block: if any of its
                 * comments are showing, hide them all; otherwise show them all.
                 * The state is still keyed by each comment's own line, so a note
                 * collapsed here is collapsed in Source mode too.
                 */
                onSetLinesCollapsed(
                  blockComments.map((comment) => comment.endLine),
                  showRows,
                )
                onRevealLine?.(block.startLine)
              }}
            >
              {showRows || isComposing ? (
                <div className="space-y-1 border-l border-line py-1 pl-3">
                  {showRows
                    ? shown?.map((comment) => (
                        <CommentRow
                          key={comment.id}
                          comment={comment}
                          onToggleResolved={() => onToggleResolved(comment.id)}
                          onDelete={() => onDeleteComment(comment.id)}
                        />
                      ))
                    : null}
                  {isComposing && composing ? (
                    <CommentComposer
                      startLine={composing.startLine}
                      endLine={composing.endLine}
                      onCancel={onCancelCompose}
                      onSubmit={(text) => onSubmitComment({ ...composing, text })}
                    />
                  ) : null}
                </div>
              ) : null}
            </PreviewBlock>
          )
        })}
      </div>

      {commentsVisible && orphans.length > 0 ? (
        <div className="space-y-1 px-4 py-3">
          <p className="text-xs text-text-faint">Comments not attached to a block</p>
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
    </div>
  )
}

/** Stable identity: an inline `{ __html: '' }` would re-set innerHTML every render. */
const EMPTY_HTML = { __html: '' }
