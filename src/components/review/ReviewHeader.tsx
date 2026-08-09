import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'

/**
 * The top strip: what's in the set, where the feedback goes, and the one action.
 *
 * ## Why "Send N comments" is the only primary
 *
 * Everything else on this surface is reading and annotating — reversible, private,
 * and free. Sending is the single moment the review leaves the app and becomes
 * work for the agent, so it is the only accent-filled control anywhere in review.
 * Emphasis is relative: a second primary would halve this one.
 *
 * ## Why the target is chosen, not assumed
 *
 * Panels can hold several sessions in different projects, and the session that
 * wrote a file is not always the one you want to fix it — you may have opened a
 * fresh one for the cleanup. The default is the owning session when its tab is
 * still open, which is right almost always, and the select exists for when it
 * isn't. With no sessions open there is nothing to choose between, so the control
 * is absent rather than empty and the button says why it can't act.
 */
export function ReviewHeader({
  fileCount,
  unresolvedCount,
  sessions,
  targetTabId,
  onTargetChange,
  onSend,
}: {
  fileCount: number
  unresolvedCount: number
  sessions: { id: string; title: string }[]
  targetTabId: string | null
  onTargetChange: (tabId: string) => void
  onSend: () => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState(0)

  // The "Sent" state is a receipt, not a mode: it decays on its own so the button
  // is ready for the next batch without anyone having to dismiss it.
  useEffect(() => {
    if (!sentAt) return
    const timer = setTimeout(() => setSentAt(0), 2000)
    return () => clearTimeout(timer)
  }, [sentAt])

  const canSend = unresolvedCount > 0 && targetTabId !== null && !sending

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
      <span className="shrink-0 text-sm font-medium text-text">Review</span>
      <span className="min-w-0 truncate text-xs text-text-faint">
        {fileCount === 0 ? 'No files' : `${fileCount} file${fileCount === 1 ? '' : 's'}`}
        {unresolvedCount > 0
          ? ` · ${unresolvedCount} comment${unresolvedCount === 1 ? '' : 's'}`
          : ''}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {sessions.length > 0 ? (
          <Select
            aria-label="Send comments to"
            value={targetTabId ?? sessions[0]!.id}
            onChange={onTargetChange}
            options={sessions.map((session) => ({ value: session.id, label: session.title }))}
            className="h-8 w-48 text-xs"
          />
        ) : null}

        {/*
          The title lives on the wrapper, not the button: a disabled button has
          `pointer-events: none`, so its own tooltip never appears — which is
          exactly when the explanation is needed.
        */}
        <span title={sessions.length === 0 ? 'Open a session to send' : undefined}>
          <Button
            variant="primary"
            disabled={!canSend}
            onClick={() => {
              setSending(true)
              void onSend()
                .then(() => setSentAt(Date.now()))
                .finally(() => setSending(false))
            }}
          >
            {sentAt ? 'Sent' : `Send ${unresolvedCount} comment${unresolvedCount === 1 ? '' : 's'}`}
          </Button>
        </span>
      </div>
    </div>
  )
}
