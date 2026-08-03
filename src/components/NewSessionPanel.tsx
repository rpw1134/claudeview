import { useEffect, useState } from 'react'
import { FolderOpen, History, Loader2, Plus, SquareTerminal } from 'lucide-react'
import type { SessionSummary } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from './ui/Button'
import { Field, Select } from './ui/Field'
import { shortenPath, timeAgo } from '@/lib/utils'

/**
 * Landing screen: start a new session, or resume an existing one.
 *
 * ## One focal point
 *
 * "New session" is the only accent-filled element on the screen, and it sits in
 * the only raised panel. Everything else — the directory row, the resume list —
 * is neutral, so the eye lands on the primary action without being told twice.
 *
 * ## No boxes inside boxes
 *
 * The old version nested a bordered directory field inside a bordered card, and
 * gave every resume row its own border. Here the panel is the only bordered
 * surface: the directory row is a plain fill, and resume rows are separated by
 * proximity plus a hover fill. Same grouping, a fraction of the lines.
 */
export function NewSessionPanel({
  home,
  onStart,
  onStartTerminal,
}: {
  home?: string
  onStart: (options: { cwd?: string; resume?: string; title?: string }) => void
  onStartTerminal: (cwd?: string) => void
}) {
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const [scope, setScope] = useState<'all' | 'cwd'>('all')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight text-text">Start a session</h1>
        <p className="mt-2 text-sm text-text-muted">
          Open sessions and terminals side by side — up to eight panels.
        </p>
        <p className="mt-1 text-xs text-text-faint">
          One message bar at the bottom sends to whichever panel is focused.
        </p>

        <div className="mt-8 rounded-xl border border-line bg-surface p-4">
          <Field
            label="Working directory"
            hint="Claude reads and writes files relative to this directory."
          >
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 flex-1 items-center truncate rounded-md bg-raised px-3
                           font-mono text-xs text-text-muted"
                title={cwd}
              >
                {cwd ? shortenPath(cwd, home) : 'Default (app working directory)'}
              </div>
              <Button variant="outline" size="lg" onClick={pickDirectory}>
                <FolderOpen size={14} />
                Choose
              </Button>
            </div>
          </Field>

          <div className="mt-4 flex gap-2">
            <Button variant="primary" size="lg" onClick={() => onStart({ cwd })} className="flex-1">
              <Plus size={16} />
              New session
            </Button>
            {/* Secondary, not primary: a terminal is the supporting act here. */}
            <Button variant="outline" size="lg" onClick={() => onStartTerminal(cwd)}>
              <SquareTerminal size={15} />
              Terminal
            </Button>
          </div>
        </div>

        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-text">
              <History size={14} className="text-text-faint" />
              Resume
            </h2>
            <Select
              value={scope}
              onChange={(value) => setScope(value as 'all' | 'cwd')}
              options={[
                { value: 'all', label: 'All projects' },
                { value: 'cwd', label: 'This directory' },
              ]}
              className="h-8 w-40"
              aria-label="Filter sessions"
            />
          </div>

          {loading ? (
            <p className="flex items-center gap-2 px-3 py-6 text-sm text-text-faint">
              <Loader2 size={14} className="animate-spin" />
              Looking for sessions…
            </p>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-6 text-sm text-text-faint">No previous sessions found.</p>
          ) : (
            <ul className="-mx-3">
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
                    className="w-full rounded-lg px-3 py-3 text-left transition-colors
                               hover:bg-surface"
                  >
                    <div className="truncate text-sm text-text">
                      {session.title ?? session.sessionId.slice(0, 8)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-faint">
                      {session.cwd ? (
                        <span className="truncate font-mono">{shortenPath(session.cwd, home)}</span>
                      ) : null}
                      {session.updatedAt ? <span>· {timeAgo(session.updatedAt)}</span> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
