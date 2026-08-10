import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Who is using the app, and how far they've been welcomed.
 *
 * Deliberately tiny and local — a name for greetings and nothing else. This is
 * not an account: nothing here leaves the machine, and everything works with
 * the fields empty.
 *
 * `onboardedAt` / `tourAt` are timestamps rather than booleans so a future
 * "what's new since you onboarded" has something to compare against, and so
 * re-running the tour after an update is a decision the data can support.
 */
type ProfileState = {
  name: string
  onboardedAt: number | null
  tourAt: number | null

  setName: (name: string) => void
  completeOnboarding: () => void
  completeTour: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (setState) => ({
      name: '',
      onboardedAt: null,
      tourAt: null,

      setName: (name) => setState({ name: name.trim().slice(0, 40) }),
      completeOnboarding: () => setState({ onboardedAt: Date.now() }),
      completeTour: () => setState({ tourAt: Date.now() }),
    }),
    { name: 'claudeview.profile', version: 1 },
  ),
)

/** "Good morning" / "afternoon" / "evening", by local clock. */
export function daypartGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
