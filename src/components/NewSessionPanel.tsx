import { useEffect, useState } from 'react'
import {
  ChevronRight,
  FolderOpen,
  Loader2,
  Search,
  SlidersHorizontal,
  SquareTerminal,
  X,
} from 'lucide-react'
import type { SessionSummary } from '@shared/ipc'
import { api } from '@/lib/api'
import { Mark, Wordmark } from './Mark'
import { SketchRule } from './Sketch'
import { Button } from './ui/Button'
import { Segmented } from './ui/Field'
import { cn, shortenPath, timeAgo } from '@/lib/utils'

/**
 * Landing screen: pick a directory, then start something in it — or step
 * sideways into Claude config.
 *
 * ## Two destinations, one page
 *
 * Everything in the body is about *sessions* and is scoped by the directory
 * control. Config is a different surface entirely (it has its own scope picker),
 * so its entry point sits apart in the top corner as a quiet ghost action —
 * discoverable on the first visit, invisible to the eye that came here to start
 * a session. Same toggle as Opt+K and the toolbar button.
 *
 * ## Why it isn't a centred card any more
 *
 * It used to be a `max-w-xl` column centred in the window: a narrow strip of content
 * with a wide empty margin on both sides, which is what a settings dialog looks like,
 * not what a workspace looks like. Now the page is left-aligned against a generous
 * margin, and the resume rows use the full width — title, path and age on one line
 * — so the window's width buys you readable rows rather than more nothing.
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
  onOpenConfig,
}: {
  home?: string
  onStart: (options: { cwd?: string; resume?: string; title?: string }) => void
  onStartTerminal: (cwd?: string) => void
  onOpenConfig: () => void
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
      <div className="mx-auto w-full max-w-5xl px-10 py-12 lg:py-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-text-muted">
              Sessions and terminals, side by side. Drag a panel by its header to move it,
              drag a divider to resize.
            </p>
          </div>
          <Button
            variant="ghost"
            size="md"
            onClick={onOpenConfig}
            title="Agents, skills, and hooks — ⌥K"
            className="shrink-0"
          >
            <SlidersHorizontal size={14} />
            Claude config
          </Button>
        </div>

        {/*
          The directory comes first because it scopes everything under it — the new
          session, the terminal, and the resume list. One button rather than a
          read-only field plus a "Choose": the value and the way to change it are the
          same target, which is fewer elements and a much larger hit area.
        */}
        <div className="mt-12 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-80">
            <h2 className="text-xs font-medium uppercase tracking-wide text-text-faint">Working directory</h2>
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
              <span className="shrink-0 text-xs text-text-faint group-hover:text-accent">
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

        <p className="mt-3 text-xs text-text-faint">
          ⌥T new session · ⌥C new terminal · ⌥A / ⌥S split · ⌥Tab switch · ⌥K config
        </p>

        <section className="mt-14">
          <h2 className="font-display text-xl text-text">pick up where you left off</h2>

          {/*
            Search is a real control, always present, sized like something you're
            meant to type in. It used to appear only past eight sessions, which meant
            the one moment you'd reach for it — a long list — was also the first time
            you'd ever seen it.
          */}
          <div className="mt-3 flex items-center gap-2">
            <div
              className="hand-1 flex h-11 min-w-0 flex-1 items-center gap-2.5 bg-surface px-3.5
                         transition-colors focus-within:bg-raised
                         focus-within:ring-1 focus-within:ring-accent/40"
            >
              <Search size={16} className="shrink-0 text-text-faint" aria-hidden />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search your sessions"
                aria-label="Search sessions"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-text
                           outline-none placeholder:text-text-faint"
              />
              {filter ? (
                <button
                  onClick={() => setFilter('')}
                  aria-label="Clear search"
                  className="hand-sm-1 shrink-0 p-1 text-text-faint transition-colors hover:text-text"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
            {/* Two visible options, not a dropdown: with the alternatives always
                on screen the current scope never needs decoding, and there's no
                native menu chrome interrupting the page's own material. */}
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'All projects' },
                { value: 'cwd', label: 'This directory' },
              ]}
              className="h-11"
              aria-label="Scope sessions"
            />
          </div>

          <SketchRule className="mb-1 mt-4 text-ink-faint" />

          {loading ? (
            <p className="flex items-center gap-2 px-2 py-8 text-sm text-text-faint">
              <Loader2 size={14} className="animate-spin" />
              Looking for sessions…
            </p>
          ) : visible.length === 0 ? (
            <p className="max-w-[56ch] px-2 py-8 text-sm leading-relaxed text-text-faint">
              {sessions.length === 0
                ? 'Nothing yet. Sessions you start in the terminal show up here too — they share the same store.'
                : `Nothing matches “${filter.trim()}”.`}
            </p>
          ) : (
            /*
              One column. Two columns forced a decision on every row — which side
              is next? — for a list whose only ordering is "most recent first". The
              width goes to the row instead: title, path and age all fit on one line
              without truncating.
            */
            <ul>
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
                    className="hand-sm-1 group flex w-full items-baseline gap-4 px-3 py-2.5 text-left
                               transition-colors hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text">
                      {session.title ?? session.sessionId.slice(0, 8)}
                    </span>
                    {session.cwd ? (
                      <span className="hidden max-w-[22ch] shrink-0 truncate font-mono text-xs
                                       text-text-faint sm:inline">
                        {shortenPath(session.cwd, home)}
                      </span>
                    ) : null}
                    {session.updatedAt ? (
                      <span className="w-16 shrink-0 text-right text-xs text-text-faint">
                        {timeAgo(session.updatedAt)}
                      </span>
                    ) : null}
                    <ChevronRight
                      size={15}
                      className="shrink-0 self-center text-text-faint opacity-0 transition-opacity
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
