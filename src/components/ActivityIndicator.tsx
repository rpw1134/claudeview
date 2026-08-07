import { useEffect, useRef, useState } from 'react'
import type { SessionStatus } from '@shared/ipc'
import { Mark, type MarkState } from './Mark'
import { cn } from '@/lib/utils'

/**
 * What the agent is doing right now, as a glyph, a word, and an elapsed count.
 *
 * ## Why an animation rather than a static badge
 *
 * A long turn is indistinguishable from a hung one if nothing on screen moves.
 * The terminal client solves this with a spinner and a running clock, and it's the
 * single most reassuring thing about watching a long task there — you can tell at a
 * glance that it's alive and roughly how long it's been going. A static "thinking"
 * label answers neither question.
 *
 * ## Why the glyph differs per phase
 *
 * Thinking, writing, and running a tool feel different and take different amounts
 * of time, so they get different motion: a slow breathing dot, a left-to-right
 * wave, and a rotating arc respectively. Shape and motion carry the distinction,
 * not colour alone — the whole indicator is one accent hue.
 *
 * All three collapse to a still glyph under `prefers-reduced-motion` (handled
 * globally in index.css), where the elapsed counter carries the liveness instead.
 */

/**
 * Lowercase, and verbs rather than nouns. "Thinking" with a capital reads as a
 * status field's value; "thinking…" reads as something happening.
 */
const LABELS: Partial<Record<SessionStatus, string>> = {
  starting: 'waking up',
  thinking: 'thinking',
  streaming: 'writing',
  tool: 'working',
}

/**
 * Statuses that mean "a turn is in flight".
 *
 * `starting` is deliberately excluded: the subprocess coming up is not a turn, and
 * treating it as one made a freshly opened panel look busy before anything had been
 * asked of it.
 */

export function isBusyStatus(status: SessionStatus): boolean {
  return status === 'thinking' || status === 'streaming' || status === 'tool'
}

export function ActivityIndicator({
  status,
  /** Hide the word and the clock, leaving just the glyph. For tight headers. */
  compact = false,
  className,
}: {
  status: SessionStatus
  compact?: boolean
  className?: string
}) {
  const elapsed = useElapsedSeconds(isBusyStatus(status) || status === 'starting')
  const label = LABELS[status]
  if (!label) return null

  return (
    <span
      // The compact form is a silent duplicate of the labelled one in the
      // transcript. Two live regions announcing "Thinking" every second is worse
      // than one, so only the labelled form speaks.
      {...(compact
        ? { 'aria-hidden': true }
        : { role: 'status', 'aria-label': `${label}, ${elapsed} seconds elapsed` })}
      className={cn('flex items-center gap-2 text-sm text-accent', className)}
    >
      {/* The mark itself, in the state it's in. One drawn thing that changes
          behaviour, rather than a different spinner per phase. */}
      {compact ? <Mark state={markStateFor(status)} size={15} /> : null}
      {compact ? null : (
        <>
          <span>{label}…</span>
          {/* Tabular figures so the width doesn't twitch as the count ticks. */}
          <span className="text-xs text-text-faint tabular-nums">{formatElapsed(elapsed)}</span>
        </>
      )}
    </span>
  )
}

/**
 * Seconds until a minute has passed, then minutes and seconds.
 *
 * `90s` is arithmetic the reader has to do; `1m 30s` is a duration. Below a minute
 * the unit is unambiguous and the extra `0m` would just be noise, so the switch
 * happens exactly where the number stops being readable at a glance.
 */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  // Padded, so the string stops changing width once past a minute.
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
}

function markStateFor(status: SessionStatus): MarkState {
  if (status === 'streaming') return 'writing'
  if (status === 'tool') return 'working'
  return 'thinking'
}

/**
 * Seconds since the current activity began.
 *
 * Restarts whenever `active` flips on, so each turn is timed from its own start
 * rather than from mount. The interval is torn down the moment activity stops —
 * one idle panel with a live timer would be harmless, eight would not.
 */
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }

    startedAt.current = Date.now()
    setElapsed(0)

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [active])

  return elapsed
}
