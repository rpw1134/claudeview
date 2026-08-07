import { memo } from 'react'
import { cn } from '@/lib/utils'

/**
 * The ClaudeView mark: a six-armed asterisk, drawn rather than constructed.
 *
 * ## Why it isn't geometric
 *
 * A perfect asterisk — six arms at exactly 60°, identical length, uniform stroke —
 * is what a shape *library* produces, and it reads that way. This one is off by a
 * few degrees per arm, varies its length by up to 12%, and tapers: each arm is a
 * path with a slight bow, not a line. None of the deviations are large enough to
 * look broken; together they're the difference between drawn and generated.
 *
 * The asymmetry is also functional. A perfectly symmetric asterisk has no legible
 * rotation — spin it and it appears to stutter between six identical positions.
 * Uneven arms give the eye something to track, so the `working` state actually
 * reads as turning.
 *
 * ## States
 *
 * Each arm is its own `<path>` in its own group, so states are genuine animation
 * rather than swapping one spinner for another:
 *
 *   idle      still, faint — present but not asking for anything
 *   thinking  the whole mark breathes, arms counter-rotating slightly
 *   working   rotates; the uneven arms make the rotation readable
 *   writing   arms pulse outward in sequence, like something being written
 *   failed    settles asymmetric and off-centre, in the danger hue
 *
 * All of it is `transform` and `opacity`, so it composites and never triggers
 * layout — up to eight of these can run beside a streaming transcript.
 */

export type MarkState = 'idle' | 'thinking' | 'working' | 'writing' | 'failed'

/**
 * Arm geometry: angle in degrees, length as a fraction of the radius, and a bow
 * (perpendicular offset at the midpoint) that gives each stroke its curve.
 *
 * Hand-placed rather than computed. A loop with jitter added would be regenerating
 * randomness on every render, and the *specific* imbalance here is the drawing.
 */
const ARMS = [
  { angle: 2, length: 1.0, bow: 0.05, weight: 1.15 },
  { angle: 58, length: 0.9, bow: -0.06, weight: 0.95 },
  { angle: 123, length: 0.97, bow: 0.04, weight: 1.05 },
  { angle: 178, length: 0.88, bow: 0.07, weight: 0.9 },
  { angle: 241, length: 1.0, bow: -0.05, weight: 1.1 },
  { angle: 302, length: 0.92, bow: 0.05, weight: 1.0 },
] as const

const CENTER = 12
const RADIUS = 9

/** A slightly bowed stroke from near the centre out to the arm's tip. */
function armPath(angle: number, length: number, bow: number): string {
  const radians = (angle * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)

  // Barely off centre. A larger inset reads as a hole at icon sizes — the strokes
  // have to *meet*, the way they would if you'd drawn them in one pass.
  const x0 = CENTER + dx * RADIUS * 0.05
  const y0 = CENTER + dy * RADIUS * 0.05
  const x1 = CENTER + dx * RADIUS * length
  const y1 = CENTER + dy * RADIUS * length

  // Control point pushed perpendicular to the arm — this is the curve.
  const mx = (x0 + x1) / 2 - dy * RADIUS * bow
  const my = (y0 + y1) / 2 + dx * RADIUS * bow

  return `M${x0.toFixed(2)} ${y0.toFixed(2)} Q${mx.toFixed(2)} ${my.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export const Mark = memo(function Mark({
  state = 'idle',
  size = 20,
  className,
}: {
  state?: MarkState
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={cn('mark', `mark-${state}`, className)}
    >
      <g className="mark-body">
        {ARMS.map((arm, index) => (
          <path
            key={arm.angle}
            className="mark-arm"
            // Staggered so `writing` ripples around the mark instead of pulsing
            // all six arms at once.
            style={{ animationDelay: `${index * 90}ms` }}
            d={armPath(arm.angle, arm.length, arm.bow)}
            stroke="currentColor"
            strokeWidth={arm.weight}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  )
})

/** The wordmark: the mark plus the app name in the written face. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-baseline gap-2.5', className)}>
      <Mark state="idle" size={28} className="translate-y-1 text-accent" />
      <span className="font-display text-3xl tracking-tight text-text">ClaudeView</span>
    </span>
  )
}
