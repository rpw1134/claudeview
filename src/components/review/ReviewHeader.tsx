/**
 * The top strip: what's in the set, and nothing else.
 *
 * This used to carry a target-session dropdown and a global "Send N comments".
 * Both were answering a question the surface shouldn't ask: changes belong to
 * the session that made them, so the reply target is a fact, not a choice.
 * Sending now lives on each session group in the rail, next to the name of the
 * conversation it answers — and the header goes back to being a label.
 */
export function ReviewHeader({
  fileCount,
  unresolvedCount,
}: {
  fileCount: number
  unresolvedCount: number
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
      <span className="shrink-0 text-sm font-medium text-text">Review</span>
      <span className="min-w-0 truncate text-xs text-text-faint">
        {fileCount === 0 ? 'No files' : `${fileCount} file${fileCount === 1 ? '' : 's'}`}
        {unresolvedCount > 0
          ? ` · ${unresolvedCount} open comment${unresolvedCount === 1 ? '' : 's'}`
          : ''}
      </span>
    </div>
  )
}
