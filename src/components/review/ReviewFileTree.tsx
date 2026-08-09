import { useMemo, useState } from 'react'
import type { ReviewFile } from '@shared/ipc'
import { Button } from '@/components/ui/Button'
import { isUnviewed, useReviewStore } from '@/stores/reviewStore'
import { shortenPath } from '@/lib/utils'
import { buildTree } from './fileTree'
import { DirChildren } from './ReviewTreeNode'

/**
 * The rail: everything an agent has changed, grouped by root and nested by folder.
 *
 * Roots only get a heading when there is more than one, because a single-root
 * review — the common case — would otherwise open with a heading that says the same
 * thing as the window. When several sessions are running in different projects the
 * heading is the only thing telling two `index.ts` entries apart.
 *
 * The rail shrinks to 200px before the code pane gives up any width. Filenames
 * truncate well; code does not.
 */
export function ReviewFileTree({
  files,
  activePath,
  home,
  unresolvedFor,
  onSelect,
  onDismissAll,
}: {
  files: ReviewFile[]
  activePath: string | null
  home?: string
  unresolvedFor: (path: string) => number
  onSelect: (path: string) => void
  onDismissAll: () => void
}) {
  const groups = useMemo(() => buildTree(files), [files])
  const viewedAt = useReviewStore((state) => state.viewedAt)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex w-65 min-w-50 shrink flex-col border-r border-line">
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {groups.map(({ root, tree }) => (
          <div key={root} className="mb-2 last:mb-0">
            {groups.length > 1 ? (
              <p
                className="truncate px-2 py-1 font-mono text-xs text-text-faint"
                title={root}
              >
                {shortenPath(root, home)}
              </p>
            ) : null}

            <DirChildren
              dir={tree}
              depth={0}
              activePath={activePath}
              // Qualified by root: two projects with a `src/` must collapse
              // independently, and `TreeDir.path` is only root-relative.
              isCollapsed={(path) => collapsed.has(`${root}::${path}`)}
              onToggle={(path) => toggle(`${root}::${path}`)}
              unresolvedFor={unresolvedFor}
              isUnviewed={(file) => isUnviewed(file, viewedAt)}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>

      {/*
        Dismiss all is the only destructive control in the rail, so it sits apart
        at the bottom, ghost-quiet, and asks once. It clears what you're reading
        rather than deleting anything on disk — comments are untouched — which is
        why it confirms inline instead of behind a modal.
      */}
      <div className="shrink-0 border-t border-line p-2">
        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-xs text-text-muted">Dismiss all?</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => {
                setConfirming(false)
                onDismissAll()
              }}
            >
              Yes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-danger"
            disabled={files.length === 0}
            onClick={() => setConfirming(true)}
          >
            Dismiss all
          </Button>
        )}
      </div>
    </div>
  )
}
