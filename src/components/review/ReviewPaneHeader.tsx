import { useEffect, useState } from 'react'
import { Check, MessageSquare, Trash2, X } from 'lucide-react'
import type { ReviewFile } from '@shared/ipc'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { ViewModeToggle, type ReviewViewMode } from './ViewModeToggle'

/**
 * Path, owner, how to read it, change summary, dismiss.
 *
 * The filename is the title of this view and reads like one — `text-sm`, medium
 * weight. Everything else in the strip is deliberately quieter, and the right-hand
 * cluster is ordered by how often it's touched: view mode, then the counts it
 * doesn't change, then the two icon actions.
 *
 * The change summary is two tinted pills rather than a run of `+9 · ~8` grey
 * monospace. Same two numbers, but the fill puts them in the same visual family as
 * the gutter bars they are counting, so the header and the code agree about what
 * green and ochre mean here.
 *
 * Dismissal confirms **in place**: the trash icon swaps into a "Dismiss? ✓ ✕" row
 * for three seconds. A modal for this would be heavier than the action — it drops
 * one file from a list and the next edit brings it back — but it still deserves a
 * second beat, because the thing it silently discards is your place in the review.
 *
 * The comments toggle only appears once the file has any — nothing to show or hide
 * otherwise. `aria-pressed` and the title (`Show comments — N`) carry the state;
 * the accent tint on the icon is reinforcement, not the only signal. The view toggle
 * appears only for markdown, for the same reason: one meaningful state is furniture.
 */
export function ReviewPaneHeader({
  file,
  sessionTitle,
  counts,
  commentCount,
  commentsVisible,
  viewMode,
  onChangeViewMode,
  onToggleCommentsVisible,
  onDismiss,
}: {
  file: ReviewFile
  sessionTitle?: string
  counts: { added: number; modified: number }
  commentCount: number
  commentsVisible: boolean
  /** Null for files with only one way to read them. */
  viewMode: ReviewViewMode | null
  onChangeViewMode: (mode: ReviewViewMode) => void
  onToggleCommentsVisible: () => void
  onDismiss: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
      <span
        className={cn(
          'min-w-0 truncate font-mono text-sm font-medium',
          file.deleted ? 'text-danger' : 'text-text',
        )}
        title={file.path}
      >
        {file.relPath}
      </span>

      {sessionTitle ? (
        <span className="min-w-0 shrink truncate text-xs text-text-faint">{sessionTitle}</span>
      ) : null}

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {viewMode ? <ViewModeToggle value={viewMode} onChange={onChangeViewMode} /> : null}

        <span className="flex items-center gap-1">
          {counts.added > 0 ? (
            <CountPill
              className="bg-success/15 text-text"
              label={`${counts.added} line${counts.added === 1 ? '' : 's'} added`}
            >
              +{counts.added}
            </CountPill>
          ) : null}
          {counts.modified > 0 ? (
            <CountPill
              className="bg-accent-wash text-text"
              label={`${counts.modified} line${counts.modified === 1 ? '' : 's'} modified`}
            >
              ~{counts.modified}
            </CountPill>
          ) : null}
        </span>
      </span>

      {commentCount > 0 ? (
        <Button
          size="icon"
          variant="ghost"
          aria-pressed={commentsVisible}
          aria-label={commentsVisible ? 'Hide comments' : 'Show comments'}
          title={`Show comments — ${commentCount}`}
          onClick={onToggleCommentsVisible}
          className={commentsVisible ? 'text-accent hover:text-accent' : undefined}
        >
          <MessageSquare size={13} />
        </Button>
      ) : null}

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-text-muted">Dismiss?</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Confirm dismiss"
            onClick={() => {
              setConfirming(false)
              onDismiss()
            }}
          >
            <Check size={13} />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Keep this file" onClick={() => setConfirming(false)}>
            <X size={13} />
          </Button>
        </span>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Dismiss this file"
          title="Dismiss this file"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  )
}

/**
 * A change count, tinted to match the gutter bar it counts.
 *
 * The sigil is inside the pill, not replaced by it: `+` and `~` carry the meaning on
 * their own, so the tint is reinforcement rather than the only signal. The `title`
 * spells it out for anyone who hasn't met the shorthand.
 */
function CountPill({
  className,
  label,
  children,
}: {
  className: string
  label: string
  children: React.ReactNode
}) {
  return (
    <span
      title={label}
      className={cn('hand-sm-1 px-1.5 py-0.5 font-mono text-xs tabular-nums', className)}
    >
      {children}
    </span>
  )
}
