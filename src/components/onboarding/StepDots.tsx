import { cn } from '@/lib/utils'

/**
 * Progress for a three-step flow.
 *
 * Dots rather than "Step 2 of 3": at this length the count is legible at a
 * glance, and a number would be the loudest text in a dialog whose job is to
 * feel like a greeting. Purely decorative — the flow is linear and the buttons
 * are the only way through — so it's hidden from assistive tech and the step is
 * announced by each step's own heading instead.
 */
export function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors',
            index === current ? 'bg-accent' : 'bg-line-strong/40',
          )}
        />
      ))}
    </div>
  )
}
