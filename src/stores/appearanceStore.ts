import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  resolveColorway,
  resolveFont,
  type Appearance,
} from '@/lib/theme'

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
      version: 2,
      /**
       * v1 -> v2: move anyone still on the *old defaults* onto the new ones.
       *
       * A persisted setting normally beats a changed default — that's the point of
       * persisting it. But values that exactly match the previous defaults were
       * never chosen, they were just never touched, and treating them as choices
       * means a redesign is invisible to every existing install: you'd relaunch
       * into the old theme and reasonably conclude nothing had changed.
       *
       * Anything the user actually picked differs from the old default and is left
       * alone.
       */
      migrate: (persisted, from) => {
        const state = persisted as Partial<Appearance>
        if (from >= 2) return state

        const OLD_DEFAULTS = { colorway: 'slate', lineHeight: 1.6, measure: 72 } as const
        if (state.colorway === OLD_DEFAULTS.colorway) state.colorway = DEFAULT_APPEARANCE.colorway
        if (state.lineHeight === OLD_DEFAULTS.lineHeight) {
          state.lineHeight = DEFAULT_APPEARANCE.lineHeight
        }
        if (state.measure === OLD_DEFAULTS.measure) state.measure = DEFAULT_APPEARANCE.measure
        return state
      },
      partialize: (state) => ({
        colorway: state.colorway,
        font: state.font,
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        measure: state.measure,
      }),
      /**
       * Colorway and font ids were renamed when the palette was regenerated
       * (`graphite` -> `slate`, `terminal` -> `moss`, `inter-ish` -> `grotesque`).
       * A stored id from an older build would otherwise fall through to an
       * unstyled theme, so normalize on rehydrate and write the result back.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) {
          applyAppearance(DEFAULT_APPEARANCE)
          return
        }
        state.colorway = resolveColorway(state.colorway).id
        state.font = resolveFont(state.font)
        applyAppearance(state)
      },
    },
  ),
)
