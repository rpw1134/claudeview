import { useEffect, useState } from 'react'
import { FolderOpen, History, Loader2, Plus } from 'lucide-react'
import type { SessionSummary } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from './ui/Button'
import { Field, Select } from './ui/Field'
import { shortenPath, timeAgo } from '@/lib/utils'

/**
 * Landing screen when no session is open: start a new one, or resume an existing one.
 *
 * The resume list comes from the SDK's `listSessions()`, which reads the same
 * on-disk store the `claude` CLI writes. Sessions started in the terminal therefore
 * appear here too — the point of this app is to stop living in the terminal without
 * abandoning the history you built there.
 */
export function NewSessionPanel({
  home,
  onStart,
}: {
  home?: string
  onStart: (options: { cwd?: string; resume?: string; title?: string }) => void
}) {
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const [scope, setScope] = useState<'all' | 'cwd'>('all')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Guard against setting state after unmount — this promise can outlive the view.
    let cancelled = false

    setLoading(true)
    api['sessions:list']({ cwd: scope === 'cwd' ? cwd : undefined, limit: 40 })
      .then((found) => {
        if (!cancelled) setSessions(found.filter((entry) => entry.sessionId))
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scope, cwd])

  const pickDirectory = async () => {
    const picked = await api['app:pick-directory']()
    if (picked) setCwd(picked)
  }

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-8">
      <div className="w-full max-w-lg py-8">
        <h1 className="text-lg font-semibold text-text">Start a session</h1>
        <p className="mt-1 text-xs text-text-muted">
          Claude Code runs as a managed subprocess. Its output streams here.
        </p>

        <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
          <Field
            label="Working directory"
            hint="Claude reads and writes files relative to this directory."
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 flex-1 items-center truncate rounded-md border border-border bg-surface-raised px-2 font-mono text-xs text-text-muted">
                {cwd ? shortenPath(cwd, home) : 'Default (app working directory)'}
              </div>
              <Button variant="outline" size="md" onClick={pickDirectory}>
                <FolderOpen size={13} />
                Choose
              </Button>
            </div>
          </Field>

          <Button variant="primary" size="lg" onClick={() => onStart({ cwd })} className="w-full">
            <Plus size={14} />
            New session
          </Button>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <History size={13} />
              Resume
            </h2>
            <Select
              value={scope}
              onChange={(value) => setScope(value as 'all' | 'cwd')}
              options={[
                { value: 'all', label: 'All projects' },
                { value: 'cwd', label: 'This directory' },
              ]}
              className="h-6 w-36 text-[11px]"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-text-faint">
              <Loader2 size={13} className="animate-spin" />
              Looking for sessions…
            </div>
          ) : sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-faint">
              No previous sessions found.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sessions.map((session) => (
                <li key={session.sessionId}>
                  <button
                    onClick={() =>
                      onStart({
                        resume: session.sessionId,
                        cwd: session.cwd,
                        title: session.title ?? 'Resumed session',
                      })
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left
                               transition-colors hover:border-accent hover:bg-surface-raised"
                  >
                    <div className="truncate text-xs font-medium text-text">
                      {session.title ?? session.sessionId.slice(0, 8)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-faint">
                      {session.cwd ? (
                        <span className="truncate font-mono">
                          {shortenPath(session.cwd, home)}
                        </span>
                      ) : null}
                      {session.updatedAt ? <span>· {timeAgo(session.updatedAt)}</span> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
