import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyAppearance, DEFAULT_APPEARANCE, type Appearance } from '@/lib/theme'

type AppearanceState = Appearance & {
  set: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void
  reset: () => void
}

/**
 * Appearance settings, persisted to localStorage.
 *
 * `applyAppearance` is called from the setters (and from `onRehydrateStorage` on
 * load) rather than from a component effect, so the CSS variables are correct
 * before first paint and no component needs to subscribe to appearance at all.
 */
export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (setState, getState) => ({
      ...DEFAULT_APPEARANCE,

      set: (key, value) => {
        setState({ [key]: value } as Pick<Appearance, typeof key>)
        applyAppearance(getState())
      },

      reset: () => {
        setState({ ...DEFAULT_APPEARANCE })
        applyAppearance(DEFAULT_APPEARANCE)
      },
    }),
    {
      name: 'claudeview.appearance',
      version: 1,
      partialize: (state) => ({
        colorway: state.colorway,
        font: state.font,
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        measure: state.measure,
      }),
      onRehydrateStorage: () => (state) => {
        applyAppearance(state ?? DEFAULT_APPEARANCE)
      },
    },
  ),
)
