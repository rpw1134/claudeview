import { useMemo } from 'react'
import type { ReviewFile } from '@shared/ipc'
import { useReviewStore, type ReviewComment } from '@/stores/reviewStore'
import { Button } from '@/components/ui/Button'
import { highlightFile } from './highlight'
import { MarkdownPreview } from './MarkdownPreview'
import { Notice, Pane } from './PaneShell'
import { ReviewPaneHeader } from './ReviewPaneHeader'
import { SourceLines } from './SourceLines'
import { countMarks, markMap, useReviewFile } from './useReviewFile'
import { useReviewPaneState } from './useReviewPaneState'
import { useSplitSync } from './useSplitSync'

/**
 * The file under review: header, then the file, in whichever form you asked for.
 *
 * Read-only is a design position, not a missing feature. The agent makes the
 * changes; this surface exists to say *which lines matter* and to attach words to
 * them. An editable pane would put a second author on the file and make "who wrote
 * this line" a question the review set can't answer.
 *
 * Markdown can be read as **Source**, **Preview** or **Split**, and commenting works
 * identically in all three — a comment is a line range on the file whichever form
 * you were looking at when you wrote it, so a note left on a rendered paragraph
 * shows up on those lines in the source and goes to the agent as those lines. See
 * `markdownBlocks` for how a rendered block knows which lines it came from.
 *
 * This component is the switch between those arrangements and nothing else: the
 * model both columns share lives in `useReviewPaneState`.
 */
export function ReviewCodePane({
  file,
  sessionTitle,
  comments,
  onAddComment,
  onToggleResolved,
  onDeleteComment,
  onDismiss,
}: {
  file: ReviewFile
  /** Title of the session that last touched it, when that tab is still open. */
  sessionTitle?: string
  comments: ReviewComment[]
  onAddComment: (input: {
    startLine: number
    endLine: number
    excerpt: string
    text: string
  }) => void
  onToggleResolved: (id: string) => void
  onDeleteComment: (id: string) => void
  onDismiss: () => void
}) {
  const { body, loading, missing } = useReviewFile(file.path, file.lastChangedAt)
  const content = body?.content ?? ''

  const pane = useReviewPaneState({
    path: file.path,
    content,
    hasUnresolvedComments: comments.some((comment) => !comment.resolved),
    onAddComment,
  })
  const { sourceRef, previewRef } = useSplitSync(pane.mode === 'split')

  const highlighted = useMemo(
    () => (content ? highlightFile(file.path, content) : null),
    [file.path, content],
  )
  const lineKinds = useMemo(() => markMap(body?.marks ?? []), [body])

  /*
   * Has this user ever written a comment, anywhere?
   *
   * The one-line hint below the header teaches the click nobody was finding on their
   * own. Scoped to *ever*, not to this file: once you have written a single comment
   * you know how, and a permanent instruction you have already followed is noise
   * sitting on top of the code. Selecting the boolean rather than the array keeps
   * this from re-rendering the pane on every keystroke that lands in the store.
   */
  const neverCommented = useReviewStore((state) => state.comments.length === 0)

  const header = (
    <ReviewPaneHeader
      file={file}
      sessionTitle={sessionTitle}
      counts={countMarks(body?.marks ?? [])}
      commentCount={comments.length}
      commentsVisible={pane.commentsVisible}
      onToggleCommentsVisible={pane.toggleCommentsVisible}
      viewMode={pane.isMarkdown ? pane.viewMode : null}
      onChangeViewMode={pane.setViewMode}
      onDismiss={onDismiss}
    />
  )

  if (file.deleted || missing) {
    return (
      <Pane header={header}>
        <Notice>
          <p className="text-sm text-text-muted">This file was deleted.</p>
          <Button size="sm" variant="subtle" onClick={onDismiss}>
            Dismiss it
          </Button>
        </Notice>
      </Pane>
    )
  }

  if (body?.tooLarge) {
    return (
      <Pane header={header}>
        <Notice>
          <p className="text-sm text-text-muted">This file is too large to review here.</p>
          <p className="text-xs text-text-faint">
            Files over 2MB aren’t sent to the renderer. Open it in an editor instead.
          </p>
        </Notice>
      </Pane>
    )
  }

  if (loading || !highlighted) {
    return (
      <Pane header={header}>
        <Notice>
          <p className="text-sm text-text-faint">{loading ? 'Reading…' : 'This file is empty.'}</p>
        </Notice>
      </Pane>
    )
  }

  const shared = {
    comments,
    commentsVisible: pane.commentsVisible,
    collapsedLines: pane.collapsed,
    onSetLinesCollapsed: pane.setLinesCollapsed,
    onToggleResolved,
    onDeleteComment,
  }

  const source = (
    <SourceLines
      {...shared}
      highlighted={highlighted}
      lineKinds={lineKinds}
      onAddComment={pane.addComment}
      reveal={pane.revealInSource}
      onRevealLine={pane.mode === 'split' ? pane.revealPreview : undefined}
      scrollRef={pane.mode === 'split' ? sourceRef : undefined}
    />
  )

  const preview = (
    <MarkdownPreview
      {...shared}
      content={content}
      lineKinds={lineKinds}
      composing={pane.composing}
      onCompose={pane.setComposing}
      onCancelCompose={() => pane.setComposing(null)}
      onSubmitComment={pane.addComment}
      reveal={pane.revealInPreview}
      onRevealLine={pane.mode === 'split' ? pane.revealSource : undefined}
      scrollRef={pane.mode === 'split' ? previewRef : undefined}
    />
  )

  return (
    <Pane header={header} frameRef={pane.frameRef}>
      {/*
        The one piece of instruction on this surface, and it retires itself.
        Commenting is a click in the margin, which is the convention everywhere code
        is reviewed and is still invisible until you try it — the hover `+` shows the
        target, this names the gesture. Faint, one line, above the content rather
        than floating over it. Preview has no line numbers to click, so there the
        sentence names what is actually there.
      */}
      {neverCommented ? (
        <p className="shrink-0 border-b border-line px-4 py-1 text-xs text-text-faint">
          {pane.mode === 'preview'
            ? 'Hover a block and click + to comment on it.'
            : 'Click a line number to comment — drag for a range.'}
        </p>
      ) : null}

      {pane.mode === 'preview' ? (
        preview
      ) : pane.mode === 'split' ? (
        /*
          Two columns, equal and independent, separated by the same hairline that
          separates every other region here. `flex-1 basis-0` on each is what makes
          them halve the pane rather than size to their content — a code column is as
          wide as its longest line and would otherwise eat the prose.
        */
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col">{source}</div>
          <div aria-hidden className="w-px shrink-0 bg-line" />
          <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col">{preview}</div>
        </div>
      ) : (
        source
      )}
    </Pane>
  )
}
