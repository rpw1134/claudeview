import { useEffect, useState } from 'react'
import {
  ChevronRight,
  FolderOpen,
  Loader2,
  MessagesSquare,
  Search,
  SquareTerminal,
} from 'lucide-react'
import type { SessionSummary } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from './ui/Button'
import { Select } from './ui/Field'
import { cn, shortenPath, timeAgo } from '@/lib/utils'

/**
 * Landing screen: pick a directory, then start something in it.
 *
 * ## What it has to make obvious
 *
 * Two things, and the earlier version made neither of them clear. First, that
 * **the working directory applies to everything below it** — it was presented as a
 * form field belonging to the "new session" card, so it read as one of that card's
 * settings rather than as the context for the resume list too. It's now a single
 * control at the top with the actions grouped under it.
 *
 * Second, that **this app is panels**. The old copy described a message bar at the
 * bottom of the window, which no longer exists. A first-time screen that describes
 * the wrong UI is worse than one that describes nothing.
 *
 * ## One focal point
 *
 * "New session" is the only accent-filled element here. Everything else — the
 * directory control, the terminal button, every resume row — is neutral, so the eye
 * lands on the primary action without being told twice.
 *
 * ## No boxes inside boxes
 *
 * There are no cards at all now. Grouping is spacing and a section heading
 * (Gestalt proximity), and rows gain a fill only on hover. The previous version
 * nested a bordered field inside a bordered card; removing the outer box lost
 * nothing but lines.
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
  const [filter, setFilter] = useState('')
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

  const needle = filter.trim().toLowerCase()
  const visible = needle
    ? sessions.filter((session) =>
        `${session.title ?? ''} ${session.cwd ?? ''}`.toLowerCase().includes(needle),
      )
    : sessions

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-text">ClaudeView</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Sessions and terminals side by side, up to eight panels. Drag a panel by its
          header to rearrange, drag a divider to resize.
        </p>

        {/*
          The directory control comes first because it scopes everything under it.
          One button rather than a read-only field plus a "Choose" button: the value
          and the way to change it are the same target, which is both fewer elements
          and a larger hit area.
        */}
        <div className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-text-faint">
            Working directory
          </h2>
          <button
            onClick={pickDirectory}
            className="group mt-2 flex h-11 w-full items-center gap-3 rounded-lg bg-surface px-3
                       text-left transition-colors hover:bg-raised"
          >
            <FolderOpen size={16} className="shrink-0 text-text-faint" aria-hidden />
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono text-sm',
                cwd ? 'text-text' : 'text-text-faint',
              )}
              title={cwd}
            >
              {cwd ? shortenPath(cwd, home) : 'Default — the app’s own directory'}
            </span>
            <span className="shrink-0 text-xs text-text-faint group-hover:text-text-muted">
              Change
            </span>
          </button>
          <p className="mt-2 text-xs leading-relaxed text-text-faint">
            Claude reads and writes files relative to this directory, and it scopes the
            resume list below.
          </p>
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="primary" size="lg" onClick={() => onStart({ cwd })} className="flex-1">
            <MessagesSquare size={15} />
            New session
          </Button>
          {/* Secondary, not primary: a terminal is the supporting act here. */}
          <Button variant="outline" size="lg" onClick={() => onStartTerminal(cwd)}>
            <SquareTerminal size={15} />
            Terminal
          </Button>
        </div>

        <p className="mt-3 text-xs text-text-faint">
          <Shortcut keys="⌘T" /> new session · <Shortcut keys="⇧⌘T" /> new terminal ·{' '}
          <Shortcut keys="⌥Tab" /> switch panels
        </p>

        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-text-faint">
              Resume
            </h2>
            <div className="flex items-center gap-2">
              {/* Appears only once there's enough history for finding to be a
                  problem. A search box over four rows is furniture. */}
              {sessions.length > 8 ? (
                <div className="flex h-8 w-44 items-center gap-2 rounded-md bg-surface px-2">
                  <Search size={13} className="shrink-0 text-text-faint" aria-hidden />
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter"
                    aria-label="Filter sessions"
                    className="min-w-0 flex-1 border-none bg-transparent text-xs text-text
                               outline-none placeholder:text-text-faint"
                  />
                </div>
              ) : null}
              <Select
                value={scope}
                onChange={(value) => setScope(value as 'all' | 'cwd')}
                options={[
                  { value: 'all', label: 'All projects' },
                  { value: 'cwd', label: 'This directory' },
                ]}
                className="h-8 w-36 text-xs"
                aria-label="Scope sessions"
              />
            </div>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 px-3 py-8 text-sm text-text-faint">
              <Loader2 size={14} className="animate-spin" />
              Looking for sessions…
            </p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-8 text-sm leading-relaxed text-text-faint">
              {sessions.length === 0
                ? 'No previous sessions found. Sessions started in the terminal show up here too.'
                : 'Nothing matches that filter.'}
            </p>
          ) : (
            <ul className="-mx-3">
              {visible.map((session) => (
                <li key={session.sessionId}>
                  <button
                    onClick={() =>
                      onStart({
                        resume: session.sessionId,
                        cwd: session.cwd,
                        title: session.title ?? 'Resumed session',
                      })
                    }
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left
                               transition-colors hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">
                        {session.title ?? session.sessionId.slice(0, 8)}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-text-faint">
                        {session.cwd ? (
                          <span className="truncate font-mono">
                            {shortenPath(session.cwd, home)}
                          </span>
                        ) : null}
                        {session.updatedAt ? <span>· {timeAgo(session.updatedAt)}</span> : null}
                      </span>
                    </span>
                    <ChevronRight
                      size={15}
                      className="shrink-0 text-text-faint opacity-0 transition-opacity
                                 group-hover:opacity-100"
                      aria-hidden
                    />
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

function Shortcut({ keys }: { keys: string }) {
  return <kbd className="font-mono text-text-muted">{keys}</kbd>
}
