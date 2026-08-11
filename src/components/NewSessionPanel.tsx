import { useEffect, useState } from 'react'
import {
  ChevronRight,
  FolderOpen,
  Loader2,
  Search,
  SquareTerminal,
  X,
} from 'lucide-react'
import type { SessionSummary } from '@shared/ipc'
import { api } from '@/lib/api'
import { daypartGreeting, useProfileStore } from '@/stores/profileStore'
import { Mark, Wordmark } from './Mark'
import { SketchRule } from './Sketch'
import { Button } from './ui/Button'
import { Segmented } from './ui/Field'
import { cn, shortenPath, timeAgo } from '@/lib/utils'

/**
 * Landing screen: a greeting, a directory, and the way back in.
 *
 * ## One register at a time
 *
 * An earlier version opened with a wordmark, a tagline, a config entry, a
 * shortcut cheat-sheet, and an always-on search row — five things talking at
 * once before the page's actual job appeared. The tabs above already carry
 * navigation, and the first-run tour teaches the shortcuts, so this page keeps
 * exactly one large element (the greeting) and lets everything else recede.
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
 * proximity); rows gain a fill only on hover. Two intermediate versions each put a
 * border back — one around the whole page, one around the start-new cluster — and
 * both times the box was standing in for spacing that hadn't been spent yet. The
 * page is now two parallel sections, "Start new" and "Recent sessions", identical
 * in heading and rule, 48px apart, 12px tight inside. A card inside a page is a
 * second frame around content that already had one.
 */
export function NewSessionPanel({
  home,
  onStart,
  onStartTerminal,
}: {
  home?: string
  /**
   * `start` tells the workspace this session's directory is already settled, so
   * the new panel skips the start form it shows for ⌥T and splits. Everything
   * launched from this page qualifies: you either picked the directory above or
   * you're resuming a session that carries its own.
   */
  onStart: (options: {
    cwd?: string
    resume?: string
    title?: string
    start?: boolean
  }) => void
  onStartTerminal: (cwd?: string) => void
}) {
  const name = useProfileStore((state) => state.name)
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

  /*
   * Name the default directory instead of describing it.
   *
   * This control used to read "the app's own directory" until you picked
   * something — a phrase you can't check against the repo you meant, and one
   * that left the resulting session with no cwd at all, so its panel header had
   * nothing to show. Resolving the real path makes the default inspectable and
   * gives every session started here a directory to state.
   */
  useEffect(() => {
    let cancelled = false

    void api['app:info']().then((info) => {
      if (!cancelled && info?.cwd) setCwd((current) => current ?? info.cwd)
    })

    return () => {
      cancelled = true
    }
  }, [])

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
        {/*
         * One register at a time. The old header stacked a wordmark, a value
         * proposition, and a duplicate config entry (the tabs above already
         * carry it) before the page's actual job appeared. Now: the greeting is
         * the page's single large element — plain type, no display face — and
         * everything else recedes beneath it.
         */}
        <Wordmark className="opacity-90" />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-text">
          {name ? `${daypartGreeting()}, ${name}.` : 'Where to?'}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Start a session in a directory, or pick up where you left off.
        </p>

        {/*
          Two scopes, drawn with space instead of a box.

          The directory applies to the two buttons beside it and to nothing else —
          resuming always continues in the directory the session was born in. An
          earlier version stated that boundary by putting a border around the
          cluster, which produced a card sitting inside the page for the sake of
          grouping three controls. Boxes are the last tool for this, not the
          first: the two sections are now siblings with identical headings and
          identical drawn rules (parallel structure), 12px of air inside each
          group and 48px between them, so proximity does what the border was
          doing. Each resume row still states its own path, which is the other
          half of why nobody reads the picker as re-scoping the list.
        */}
        <section className="mt-12">
          <h2 className="text-sm font-medium text-text">Start new</h2>
          <SketchRule className="mb-1 mt-3 text-ink-faint" />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={pickDirectory}
              data-tour="directory"
              className="hand-1 group flex h-12 min-w-0 flex-1 basis-80 items-center gap-3
                         bg-surface px-3.5 text-left transition-colors hover:bg-raised"
            >
              <FolderOpen size={17} className="shrink-0 text-ink-faint" aria-hidden />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate font-mono text-sm',
                  cwd ? 'text-text' : 'text-text-faint',
                )}
                title={cwd}
              >
                {cwd ? shortenPath(cwd, home) : 'Choose a directory'}
              </span>
              <span className="shrink-0 text-xs text-text-faint group-hover:text-accent">
                change
              </span>
            </button>

            <div className="flex gap-2">
              <Button
                variant="primary"
                size="lg"
                // `start`: the directory is right there, chosen on this page, so
                // the panel has nothing left to ask and spawns immediately.
                onClick={() => onStart({ cwd, start: true })}
                data-tour="new-session"
                className="h-12 px-5"
              >
                <Mark state="idle" size={17} />
                New session
              </Button>
              {/* Secondary, not primary: a terminal is the supporting act here. */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => onStartTerminal(cwd)}
                data-tour="new-terminal"
                className="h-12"
              >
                <SquareTerminal size={16} />
                Terminal
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-medium text-text">Recent sessions</h2>

          {/*
            Search and scope earn their place: below a handful of sessions they
            are two extra controls answering a question nobody has asked yet.
            They appear together once the list is long enough to need them.
          */}
          {sessions.length > 6 ? (
            <div className="mt-3 flex items-center gap-2">
              <div
                className="hand-1 flex h-10 min-w-0 flex-1 items-center gap-2.5 bg-surface px-3.5
                           transition-colors focus-within:bg-raised
                           focus-within:ring-1 focus-within:ring-accent/40"
              >
                <Search size={15} className="shrink-0 text-text-faint" aria-hidden />
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
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: 'All projects' },
                  { value: 'cwd', label: 'This directory' },
                ]}
                className="h-10"
                aria-label="Scope sessions"
              />
            </div>
          ) : null}

          {/* The drawn rule stays: this is what "hand as accent" means — one
              quiet stroke marking a section, not a voice for headings. */}
          <SketchRule className="mb-1 mt-3 text-ink-faint" />

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
                    {/* Always visible: the row's directory is where resuming
                        takes you — the one fact the "start new" box's picker
                        does NOT control, so it must never be hidden. */}
                    {session.cwd ? (
                      <span className="max-w-[26ch] shrink-0 truncate font-mono text-xs
                                       text-text-faint">
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
