import { useEffect, useRef, useState } from 'react'
import type { SessionStatus } from '@shared/ipc'
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

const LABELS: Partial<Record<SessionStatus, string>> = {
  starting: 'Starting',
  thinking: 'Thinking',
  streaming: 'Writing',
  tool: 'Working',
}

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
      role="status"
      aria-label={`${label}, ${elapsed} seconds elapsed`}
      className={cn('flex items-center gap-1.5 text-xs text-accent', className)}
    >
      <Glyph status={status} />
      {compact ? null : (
        <>
          <span>{label}</span>
          {/* Tabular figures so the width doesn't twitch as the count ticks. */}
          <span className="text-text-faint tabular-nums">{elapsed}s</span>
        </>
      )}
    </span>
  )
}

function Glyph({ status }: { status: SessionStatus }) {
  if (status === 'streaming') {
    return (
      <span className="flex h-3 w-4 items-center justify-between" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="activity-wave h-1 w-1 rounded-full bg-current"
            style={{ animationDelay: `${index * 140}ms` }}
          />
        ))}
      </span>
    )
  }

  if (status === 'tool') {
    return <span className="activity-spin h-3 w-3 rounded-full" aria-hidden />
  }

  // thinking / starting
  return <span className="activity-breathe h-2 w-2 rounded-full bg-current" aria-hidden />
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
