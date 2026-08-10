import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  MEASURE_FULL,
  resolveColorway,
  resolveFont,
  type Appearance,
  type CustomRecipe,
} from '@/lib/theme'

/**
 * The recipe a first-time "Custom" selection starts from — a warm dark theme
 * in the spirit of Hearth, so the editor opens on something that already
 * looks intentional rather than a default grey the user has to fix before it
 * looks like anything.
 */
const DEFAULT_CUSTOM_RECIPE: CustomRecipe = {
  scheme: 'dark',
  neutralHue: 55,
  neutralChroma: 0.012,
  accent: { l: 0.74, c: 0.115, h: 62 },
}

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
        // First switch to Custom: seed a recipe so the editor (and the app)
        // has something to render instead of falling back to the default
        // colorway silently. Later switches keep whatever the user authored.
        const seedCustom =
          key === 'colorway' && value === 'custom' && getState().custom === undefined
        setState({
          [key]: value,
          ...(seedCustom ? { custom: DEFAULT_CUSTOM_RECIPE } : {}),
        } as Partial<Appearance>)
        applyAppearance(getState())
      },

      reset: () => {
        setState({ ...DEFAULT_APPEARANCE })
        applyAppearance(DEFAULT_APPEARANCE)
      },
    }),
    {
      name: 'claudeview.appearance',
      version: 4,
      /**
       * Move anyone still on the *old defaults* onto the new ones, per version.
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

        // v1 -> v2: the warm palette became the default.
        if (from < 2) {
          if (state.colorway === 'slate') state.colorway = DEFAULT_APPEARANCE.colorway
          if (state.lineHeight === 1.6) state.lineHeight = DEFAULT_APPEARANCE.lineHeight
          if (state.measure === 72) state.measure = 84
        }

        // v2 -> v3: responses fill the panel instead of capping at 84ch.
        if (from < 3 && state.measure === 84) state.measure = MEASURE_FULL

        // v3 -> v4: added `custom` (user-authored recipes) and widened
        // `colorway` to allow `'custom'`. No existing value needs
        // translating — every prior `colorway` is still a valid id, and a
        // missing `custom` is already handled by `resolveAppliedColorway`'s
        // fallback — so this bump exists only to make persisted shape and
        // code shape agree.

        return state
      },
      partialize: (state) => ({
        colorway: state.colorway,
        custom: state.custom,
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
       *
       * `'custom'` is left untouched — `resolveColorway` only knows built-in
       * ids and would otherwise silently demote a custom selection back to
       * the default colorway on every launch.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) {
          applyAppearance(DEFAULT_APPEARANCE)
          return
        }
        if (state.colorway !== 'custom') {
          state.colorway = resolveColorway(state.colorway).id
        }
        state.font = resolveFont(state.font)
        applyAppearance(state)
      },
    },
  ),
)
