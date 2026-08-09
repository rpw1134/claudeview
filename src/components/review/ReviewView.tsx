import { useEffect, useMemo, useState } from 'react'
import { useReviewStore } from '@/stores/reviewStore'
import { useSessionStore } from '@/stores/sessionStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Mark } from '@/components/Mark'
import { ReviewCodePane } from './ReviewCodePane'
import { ReviewFileTree } from './ReviewFileTree'
import { ReviewHeader } from './ReviewHeader'
import { useReviewBridge } from './useReviewBridge'

/**
 * Review mode: read what changed, say what's wrong, send it in one go.
 *
 * Review is a second workspace *mode*, a sibling of the panel mosaic rather than of
 * config — App swaps it in for the mosaic area and keeps it mounted either way, so
 * ⌥R is a switch rather than a load and the file set stays current while you work.
 * That is also why the push subscription lives here: this component is the only one
 * guaranteed to be alive for the app's lifetime that has any business owning it.
 *
 * ## The shape of the surface
 *
 * Three regions, each separated by a single hairline and nothing else: the header
 * strip (what's here, where it goes, the one action), the file rail, and the code.
 * Reading order runs left to right and matches the task — pick a file, read it,
 * comment, send — so nothing has to be discovered out of order.
 */
export function ReviewView() {
  useReviewBridge()

  const files = useReviewStore((state) => state.files)
  const activePath = useReviewStore((state) => state.activePath)
  const comments = useReviewStore((state) => state.comments)
  const loaded = useReviewStore((state) => state.loaded)
  const { setActivePath, addComment, removeComment, toggleResolved, dismiss, dismissAll } =
    useReviewStore.getState()

  const tabs = useSessionStore((state) => state.tabs)
  const [home, setHome] = useState<string | undefined>()
  /** Null until the user picks one; the default is derived, not stored. */
  const [chosenTabId, setChosenTabId] = useState<string | null>(null)

  useEffect(() => {
    api['app:info']()
      .then((info) => setHome(info.home))
      .catch(() => undefined)
  }, [])

  const activeFile = files.find((file) => file.path === activePath) ?? null

  const unresolvedByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.resolved) continue
      counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1)
    }
    return counts
  }, [comments])

  const unresolvedCount = useMemo(
    () => comments.reduce((total, comment) => (comment.resolved ? total : total + 1), 0),
    [comments],
  )

  const fileComments = useMemo(
    () => (activePath ? comments.filter((comment) => comment.path === activePath) : []),
    [comments, activePath],
  )

  const sessions = tabs.map((tab) => ({ id: tab.id, title: tab.title }))
  /*
   * Derived rather than stored, so it can't go stale: a chosen tab that has since
   * been closed falls back to the file's owner, then to the first open session.
   * Storing the resolved value would leave the send button aimed at a dead tab.
   */
  const targetTabId =
    (chosenTabId && sessions.some((session) => session.id === chosenTabId) ? chosenTabId : null) ??
    (activeFile?.tabId && sessions.some((session) => session.id === activeFile.tabId)
      ? activeFile.tabId
      : null) ??
    sessions[0]?.id ??
    null

  const header = (
    <ReviewHeader
      fileCount={files.length}
      unresolvedCount={unresolvedCount}
      sessions={sessions}
      targetTabId={targetTabId}
      onTargetChange={setChosenTabId}
      onSend={async () => {
        if (targetTabId) await useReviewStore.getState().sendComments(targetTabId)
      }}
    />
  )

  if (files.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        {/* Empty until the first list lands. "No changes to review yet." is a
            claim about the project, and making it before asking would be a
            flash of the wrong answer on every cold start. */}
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center',
            !loaded && 'invisible',
          )}
        >
          <Mark state="idle" size={32} className="text-text-faint" />
          <p className="text-sm text-text-muted">No changes to review yet.</p>
          <p className="max-w-80 text-xs leading-relaxed text-text-faint">
            Files that agents edit will appear here as they work.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1">
        <ReviewFileTree
          files={files}
          activePath={activePath}
          home={home}
          unresolvedFor={(path) => unresolvedByPath.get(path) ?? 0}
          onSelect={setActivePath}
          onDismissAll={() => void dismissAll()}
        />

        {activeFile ? (
          <ReviewCodePane
            // Remounting per file is deliberate: the pane holds selection and a
            // pending dismiss confirmation, and both are about *this* file.
            key={activeFile.path}
            file={activeFile}
            sessionTitle={tabs.find((tab) => tab.id === activeFile.tabId)?.title}
            comments={fileComments}
            onAddComment={(input) => addComment({ path: activeFile.path, ...input })}
            onToggleResolved={toggleResolved}
            onDeleteComment={removeComment}
            onDismiss={() => void dismiss([activeFile.path])}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <p className="text-sm text-text-faint">Pick a file to review.</p>
          </div>
        )}
      </div>
    </div>
  )
}
