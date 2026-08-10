import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '../ui/Button'

/**
 * Last screen: the fork.
 *
 * Two real choices, one primary. "Skip the tour" is a ghost button with plain
 * wording — no "no thanks, I'll figure it out myself" — because confirm-shaming
 * an exit is exactly the kind of thing this flow should not do.
 *
 * `tourAvailable` is false when the tour's anchors aren't on screen (a
 * workspace restored with panels open). Rather than offer a tour that would
 * highlight nothing, the screen collapses to a single "Get started".
 */
export function DoneStep({
  tourAvailable,
  onStartTour,
  onSkipTour,
}: {
  tourAvailable: boolean
  onStartTour: () => void
  onSkipTour: () => void
}) {
  return (
    <div>
      <DialogPrimitive.Title className="text-xl font-semibold tracking-tight text-text">
        You’re set.
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-2 text-sm text-text-muted">
        {tourAvailable
          ? 'A quick lap of the window takes about thirty seconds.'
          : 'Everything’s ready — start a session whenever you are.'}
      </DialogPrimitive.Description>

      <div className="mt-8 flex items-center justify-end gap-2">
        {tourAvailable ? (
          <>
            <Button variant="ghost" size="lg" onClick={onSkipTour}>
              Skip the tour
            </Button>
            <Button variant="primary" size="lg" onClick={onStartTour} autoFocus>
              Show me around
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" onClick={onSkipTour} autoFocus>
            Get started
          </Button>
        )}
      </div>
    </div>
  )
}
