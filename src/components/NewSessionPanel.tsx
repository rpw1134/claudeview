import { useEffect, useState } from 'react'
import { ChevronRight, FolderOpen, Loader2, Search, SquareTerminal } from 'lucide-react'
import type { SessionSummary } from '@shared/ipc'
import { api } from '@/lib/api'
import { Mark, Wordmark } from './Mark'
import { SketchRule } from './Sketch'
import { Button } from './ui/Button'
import { Select } from './ui/Field'
import { cn, shortenPath, timeAgo } from '@/lib/utils'

/**
 * Landing screen: pick a directory, then start something in it.
 *
 * ## Why it isn't a centred card any more
 *
 * It used to be a `max-w-xl` column centred in the window: a narrow strip of content
 * with a wide empty margin on both sides, which is what a settings dialog looks like,
 * not what a workspace looks like. Now the page is left-aligned against a generous
 * margin and the resume list runs in two columns when there's room — so the width of
 * the window buys you something.
 *
 * ## One focal point
 *
 * "New session" is the only accent-filled element here. Everything else — the
 * directory control, the terminal button, every resume row — is neutral, so the eye
 * lands on the primary action without being told twice.
 *
 * ## No boxes inside boxes
 *
 * No cards at all. Grouping is spacing, a heading, and a drawn rule (Gestalt
 * proximity); rows gain a fill only on hover. The previous version nested a bordered
 * field inside a bordered card, and removing the outer box lost nothing but lines.
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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 py-12 lg:px-14 lg:py-16">
        <Wordmark />
        <p className="mt-4 max-w-[52ch] font-display text-lg leading-relaxed text-text-muted">
          Sessions and terminals, side by side. Drag a panel by its header to move it,
          drag a divider to resize.
        </p>

        {/*
          The directory comes first because it scopes everything under it — the new
          session, the terminal, and the resume list. One button rather than a
          read-only field plus a "Choose": the value and the way to change it are the
          same target, which is fewer elements and a much larger hit area.
        */}
        <div className="mt-12 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-80">
            <h2 className="font-display text-sm text-text-faint">working in</h2>
            <button
              onClick={pickDirectory}
              className="hand-1 group mt-1.5 flex h-12 w-full items-center gap-3 bg-surface px-3.5
                         text-left transition-colors hover:bg-raised"
            >
              <FolderOpen size={17} className="shrink-0 text-ink-faint" aria-hidden />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate font-mono text-sm',
                  cwd ? 'text-text' : 'text-text-faint',
                )}
                title={cwd}
              >
                {cwd ? shortenPath(cwd, home) : 'the app’s own directory'}
              </span>
              <span className="shrink-0 font-display text-sm text-text-faint group-hover:text-accent">
                change
              </span>
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" size="lg" onClick={() => onStart({ cwd })} className="h-12 px-5">
              <Mark state="idle" size={17} />
              New session
            </Button>
            {/* Secondary, not primary: a terminal is the supporting act here. */}
            <Button variant="outline" size="lg" onClick={() => onStartTerminal(cwd)} className="h-12">
              <SquareTerminal size={16} />
              Terminal
            </Button>
          </div>
        </div>

        <p className="mt-3 font-display text-sm text-text-faint">
          ⌘T new session · ⇧⌘T new terminal · ⌥Tab switch panels
        </p>

        <section className="mt-14">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-text">pick up where you left off</h2>
            <div className="flex items-center gap-2">
              {/* Appears only once there's enough history for finding to be a
                  problem. A search box over four rows is furniture. */}
              {sessions.length > 8 ? (
                <div className="hand-sm-1 flex h-8 w-44 items-center gap-2 bg-surface px-2">
                  <Search size={13} className="shrink-0 text-text-faint" aria-hidden />
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="filter"
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

          <SketchRule className="mb-2 text-ink-faint" />

          {loading ? (
            <p className="flex items-center gap-2 px-2 py-8 text-sm text-text-faint">
              <Loader2 size={14} className="animate-spin" />
              looking…
            </p>
          ) : visible.length === 0 ? (
            <p className="max-w-[56ch] px-2 py-8 text-sm leading-relaxed text-text-faint">
              {sessions.length === 0
                ? 'Nothing yet. Sessions you start in the terminal show up here too — they share the same store.'
                : 'Nothing matches that filter.'}
            </p>
          ) : (
            /* Two columns when the window can hold them, which is what turns the
               extra width into more history rather than more margin. */
            <ul className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
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
                    className="hand-sm-1 group flex w-full items-center gap-3 px-2.5 py-2.5 text-left
                               transition-colors hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">
                        {session.title ?? session.sessionId.slice(0, 8)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-text-faint">
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
