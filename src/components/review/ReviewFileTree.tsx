import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { ReviewFile } from '@shared/ipc'
import { Button } from '@/components/ui/Button'
import { isUnviewed, useReviewStore } from '@/stores/reviewStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { shortenPath } from '@/lib/utils'
import { buildTree } from './fileTree'
import { DirChildren } from './ReviewTreeNode'

export type SessionGroup = {
  /** Open session tab id, or null for changes with no live session. */
  tabId: string | null
  title: string
  files: ReviewFile[]
}

/**
 * The rail: changes grouped by the session that made them, nested by folder.
 *
 * ## Sessions are the top-level grouping
 *
 * A change belongs to a conversation. Grouping by directory first buried that:
 * files from three sessions interleaved by path, and feedback needed a target
 * picker to disambiguate what the grouping had thrown away. Now each group is
 * one session's work and carries its own Reply — the target is a fact shown in
 * the heading, not a dropdown decision.
 *
 * Within a group, files still nest by directory (per root, headed only when a
 * group spans more than one root).
 *
 * The rail shrinks to 200px before the code pane gives up any width. Filenames
 * truncate well; code does not.
 */
export function ReviewFileTree({
  groups,
  activePath,
  home,
  unresolvedFor,
  onSelect,
  onDismissAll,
}: {
  groups: SessionGroup[]
  activePath: string | null
  home?: string
  unresolvedFor: (path: string) => number
  onSelect: (path: string) => void
  onDismissAll: () => void
}) {
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

  const fileCount = groups.reduce((total, group) => total + group.files.length, 0)

  return (
    <div className="flex w-65 min-w-50 shrink flex-col border-r border-line">
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {groups.map((group) => (
          <SessionGroupSection
            key={group.tabId ?? '::other'}
            group={group}
            activePath={activePath}
            home={home}
            unresolvedFor={unresolvedFor}
            isUnviewed={(file) => isUnviewed(file, viewedAt)}
            isCollapsed={(path) => collapsed.has(path)}
            onToggle={toggle}
            onSelect={onSelect}
          />
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
            disabled={fileCount === 0}
            onClick={() => setConfirming(true)}
          >
            Dismiss all
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * One session's changes: a heading that names the conversation, its Reply, and
 * the file tree beneath.
 *
 * Reply lives here — with the session it answers — rather than in a global
 * header. There can be several visible at once, one per session with pending
 * comments; that's not competing emphasis, it's the same action at each of its
 * distinct targets.
 */
function SessionGroupSection({
  group,
  activePath,
  home,
  unresolvedFor,
  isUnviewed,
  isCollapsed,
  onToggle,
  onSelect,
}: {
  group: SessionGroup
  activePath: string | null
  home?: string
  unresolvedFor: (path: string) => number
  isUnviewed: (file: ReviewFile) => boolean
  isCollapsed: (path: string) => boolean
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}) {
  const roots = useMemo(() => buildTree(group.files), [group.files])
  const pending = group.files.reduce((total, file) => total + unresolvedFor(file.path), 0)

  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  // A receipt, not a mode: decays on its own so the button is ready for the
  // next batch without anyone having to dismiss it.
  useEffect(() => {
    if (!sentAt) return
    const timer = setTimeout(() => setSentAt(0), 2000)
    return () => clearTimeout(timer)
  }, [sentAt])

  const reply = () => {
    if (!group.tabId || sending) return
    setSending(true)
    void useReviewStore
      .getState()
      .sendCommentsFor(group.tabId, group.files.map((file) => file.path))
      .then((count) => {
        if (count > 0) setSentAt(Date.now())
      })
      .finally(() => setSending(false))
  }

  const jump = () => {
    if (!group.tabId) return
    const workspace = useWorkspaceStore.getState()
    const panel = workspace.panels.find(
      (entry) => entry.kind === 'session' && entry.refId === group.tabId,
    )
    if (panel) workspace.focusPanel(panel.id, true)
    workspace.setMode('panels')
  }

  return (
    <section className="mb-3 last:mb-0">
      <div className="flex items-center gap-1 py-1 pl-2 pr-1.5">
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-text"
          title={group.tabId ? `Changes from "${group.title}"` : 'Changes with no open session'}
        >
          {group.title}
        </span>
        {group.tabId ? (
          <>
            {/* Session-scoped reply: comments on THIS group's files go to THIS
                session. It only exists once there's something to say. */}
            {pending > 0 ? (
              <Button size="sm" variant="primary" disabled={sending} onClick={reply}>
                {sentAt ? 'Sent' : `Reply · ${pending}`}
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Go to "${group.title}"`}
              title="Go to session"
              onClick={jump}
            >
              <ArrowUpRight size={13} />
            </Button>
          </>
        ) : null}
      </div>

      {roots.map(({ root, tree }) => (
        <div key={root}>
          {roots.length > 1 ? (
            <p className="truncate px-2 py-1 font-mono text-xs text-text-faint" title={root}>
              {shortenPath(root, home)}
            </p>
          ) : null}
          <DirChildren
            dir={tree}
            depth={0}
            activePath={activePath}
            // Qualified by group and root: two sessions touching the same
            // project's `src/` must collapse independently.
            isCollapsed={(path) => isCollapsed(`${group.tabId ?? 'other'}::${root}::${path}`)}
            onToggle={(path) => onToggle(`${group.tabId ?? 'other'}::${root}::${path}`)}
            unresolvedFor={unresolvedFor}
            isUnviewed={isUnviewed}
            onSelect={onSelect}
          />
        </div>
      ))}
    </section>
  )
}
