import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useProfileStore } from '@/stores/profileStore'

/**
 * The guided tour: six stops around the window, driven by driver.js.
 *
 * ## Why a library
 *
 * A tour is a spotlight cut out of a full-screen overlay, repositioned against a
 * moving target, with focus and keyboard handling — the same class of problem as
 * a dialog, and the same reason we don't hand-roll one.
 *
 * ## Anchors, not coordinates
 *
 * Every stop points at a `data-tour` attribute. Selectors tied to class names or
 * DOM shape rot the first time someone reflows a toolbar; a named anchor is a
 * declaration by the component that *this* is the thing the tour means.
 *
 * The anchors live on the landing screen and the toolbar, so a workspace with
 * panels open has only some of them. `skipMissingElement` drops the absent ones
 * rather than highlighting empty space, and `canTour()` lets the caller avoid
 * offering a tour that would be mostly holes.
 */
const STEPS: readonly DriveStep[] = [
  {
    element: '[data-tour="tabs"]',
    popover: {
      title: 'Three surfaces',
      description:
        'Sessions, Review, and Config live here. Review appears when agents change files.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="directory"]',
    popover: {
      title: 'Start with a directory',
      description: 'Every session starts in a directory — pick where Claude works.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="new-session"]',
    popover: {
      title: 'New session',
      description: 'Start a conversation. ⌥T from anywhere.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="new-terminal"]',
    popover: {
      title: 'And a terminal',
      description: 'A real terminal, right beside your sessions. ⌥C.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="panel-controls"]',
    popover: {
      title: 'Split the window',
      description: 'Split and arrange up to eight panels. ⌥A and ⌥S split; ⌥1–8 jump.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="settings"]',
    popover: {
      title: 'Make it yours',
      description: 'Appearance — themes, type, spacing. ⌘,.',
      side: 'bottom',
      align: 'end',
    },
  },
]

/** Anchors present right now. The tour is only worth offering if most are. */
function presentSteps(): DriveStep[] {
  return STEPS.filter((step) => document.querySelector(step.element as string) !== null)
}

/**
 * Is there enough on screen for a tour to be worth running? The landing screen
 * is the only state where every anchor exists, so this doubles as "are we on
 * the landing page" without the tour needing to know about the workspace store.
 */
export function canTour(): boolean {
  return presentSteps().length === STEPS.length
}

/**
 * Run the tour, then mark it done.
 *
 * `completeTour` fires from `onDestroyed`, which covers every exit — finishing,
 * Escape, the close button, a click on the overlay — so there is no path that
 * leaves the tour pending and re-offers it on the next launch.
 *
 * Starting is deferred a frame: callers close a dialog and start the tour in the
 * same tick, and driver measures the highlighted element immediately, so it
 * would otherwise size the spotlight against a layout that still has a modal in
 * it. Everything is wrapped — a broken tour must never take the app with it, and
 * a tour that failed to start is marked complete rather than retried forever.
 */
export function startTour(): void {
  const finish = () => useProfileStore.getState().completeTour()

  requestAnimationFrame(() => {
    try {
      const steps = presentSteps()
      if (steps.length === 0) {
        finish()
        return
      }

      driver({
        steps,
        skipMissingElement: true,
        // Matches the Dialog backdrop, so a tour and a modal dim the app by the
        // same amount and read as the same layer of the interface.
        overlayColor: '#000',
        overlayOpacity: 0.5,
        stagePadding: 6,
        stageRadius: 8,
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        popoverClass: 'stryde-tour',
        onDestroyed: finish,
      }).drive()
    } catch (error) {
      // Logged, not surfaced: a broken tour must never take the app with it,
      // but a silent one is undebuggable.
      console.error('Tour failed to start:', error)
      finish()
    }
  })
}
