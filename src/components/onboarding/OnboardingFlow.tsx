import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useProfileStore } from '@/stores/profileStore'
import { StepDots } from './StepDots'
import { WelcomeStep } from './WelcomeStep'
import { ThemeStep } from './ThemeStep'
import { DoneStep } from './DoneStep'
import { canTour, startTour } from './tour'

const STEP_COUNT = 3

/**
 * First run, once.
 *
 * ## It gates itself
 *
 * The only thing App has to do is mount it. `onboardedAt === null` is the whole
 * condition, read from the persisted profile store — no prop, no flag threaded
 * down from the root, and nothing for a future caller to get wrong.
 *
 * ## Why this one can't be dismissed
 *
 * Every other dialog in the app closes on Escape or a click outside, and that is
 * the right default — but this flow *writes* the state that stops it appearing
 * again, so a dismissal that skipped the write would return on the next launch,
 * and one that performed it would silently mark three questions answered. Both
 * are worse than the two-tap path through. Three screens with a visible end,
 * every one of them skippable in a tap, is a short enough trap to be honest —
 * and the last screen is a genuine fork, not a funnel.
 *
 * This is why the shell is built from the Radix primitives instead of our
 * `DialogContent`: that shell always renders a close affordance, which is a
 * promise this dialog can't keep.
 */
export function OnboardingFlow() {
  const onboardedAt = useProfileStore((state) => state.onboardedAt)
  const [step, setStep] = useState(0)
  /*
   * Sampled once, AFTER the first commit. A `useState(canTour)` initializer runs
   * during this component's very first render — before React has committed any
   * DOM at all — so every anchor query came back empty and the tour was offered
   * to nobody, ever. An effect runs against the committed tree. Still sampled
   * exactly once: re-asking after the theme step would let a background change
   * swap the last screen's buttons out from under a hand already moving.
   */
  const [tourAvailable, setTourAvailable] = useState(false)
  useEffect(() => {
    setTourAvailable(canTour())
  }, [])

  if (onboardedAt !== null) return null

  const finish = (withTour: boolean) => {
    const { completeOnboarding, completeTour } = useProfileStore.getState()
    completeOnboarding()
    // Unmounts this component (the gate above is now false), which is what lets
    // the tour measure a window with no modal in it.
    if (withTour) startTour()
    else completeTour()
  }

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          // Escape and outside clicks are the two ways Radix would close this;
          // both are refused rather than left to a no-op `onOpenChange`, so the
          // primitive never fights the gate above.
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-4rem))]
                     max-h-[calc(100vh-8rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto
                     rounded-xl bg-overlay p-8 shadow-2xl"
        >
          {step === 0 ? (
            <WelcomeStep onContinue={() => setStep(1)} />
          ) : step === 1 ? (
            <ThemeStep onContinue={() => setStep(2)} />
          ) : (
            <DoneStep
              tourAvailable={tourAvailable}
              onStartTour={() => finish(true)}
              onSkipTour={() => finish(false)}
            />
          )}

          <div className="mt-8 flex justify-center">
            <StepDots count={STEP_COUNT} current={step} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
