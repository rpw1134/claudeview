import { cn } from '@/lib/utils'

/**
 * Drawn rules and underlines.
 *
 * A `border-bottom` is a perfectly straight line of uniform weight — the most
 * machine-made mark a UI can contain. These are hand-plotted paths that wander by a
 * pixel or two and vary in thickness, so a section break reads as ruled off by
 * someone rather than emitted by a stylesheet.
 *
 * The paths are fixed, not randomised. Generating jitter per render would redraw the
 * line on every state change — a rule that squirms is far worse than one that's
 * straight — and it would also make the component non-deterministic to test.
 *
 * `preserveAspectRatio="none"` lets one 100-unit path stretch to any width. The
 * horizontal stretch changes the wobble's frequency but not its amplitude, which is
 * exactly right: a longer rule drawn by hand has longer waves, not bigger ones.
 */

/** A full-width section rule. */
export function SketchRule({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      className={cn('block h-[4px] w-full', className)}
      aria-hidden
    >
      <path
        d="M0.5 2.2 C 12 1.2, 26 3.0, 38 2.0 S 62 1.1, 74 2.4 S 92 2.9, 99.5 1.8"
        stroke="currentColor"
        strokeWidth="0.55"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
    </svg>
  )
}

/**
 * A short underline for a heading — the kind you'd draw under a word, overshooting
 * slightly at one end because a pen doesn't stop exactly where a letter does.
 */
export function SketchUnderline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      className={cn('block h-[6px] w-full', className)}
      aria-hidden
    >
      <path
        d="M1 4.2 C 18 2.6, 34 4.8, 52 3.2 S 84 2.4, 98 3.9"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  )
}
