/**
 * First-run onboarding and the guided tour.
 *
 * `OnboardingFlow` self-gates on the profile store, so mounting it is the entire
 * integration. `startTour` / `canTour` are exported separately so the tour can
 * be re-offered later (a "show me around again" entry in Settings, a what's-new
 * after an update) without going through onboarding again.
 */
export { OnboardingFlow } from './OnboardingFlow'
export { startTour, canTour } from './tour'
