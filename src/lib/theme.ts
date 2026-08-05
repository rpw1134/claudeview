/**
 * Colorways, typography, and the shared visual scales.
 *
 * Every theme-able value is a CSS custom property on `<html>`. Components
 * reference semantic names (`--surface`, `--accent`) and never a literal color, so
 * switching a colorway is one `style.setProperty` pass — no rebuild, no React
 * re-render, no flash.
 *
 * ## Colorways are generated, not hand-picked
 *
 * Each colorway is declared as a *hue plus a chroma level*, and the full ramp is
 * generated from one shared lightness scale. Hand-tuning five palettes
 * independently is how contrast drifts: one theme ends up harsher than another and
 * "muted" text means something different in each. Generating them means the
 * text-on-surface contrast ratio is identical in every colorway by construction.
 *
 * ## Why OKLCH
 *
 * OKLCH is perceptually uniform: equal lightness reads as equally bright across
 * hues. In sRGB hex it does not — a "same value" blue and green look like different
 * weights, which is what makes hand-mixed palettes feel subtly inconsistent.
 */

export type ColorwayId = 'paper' | 'hearth' | 'slate' | 'ink' | 'nord' | 'moss' | 'parchment'

/**
 * The dark lightness ramp.
 *
 * Deliberately does **not** start near black. Pure/near black makes every piece of
 * text a maximum-contrast event, which is exactly the "too black, too contrasty"
 * problem — the eye gets no rest and the UI reads as harsh. Starting the window at
 * L≈0.205 and stepping up keeps body text at ~13.7:1 (still AAA) instead of ~16:1.
 *
 * `line` is a quiet divider. `lineStrong` is for genuine control boundaries — form
 * fields whose edge is the only thing identifying them — and is set to clear the
 * WCAG 1.4.11 3:1 non-text threshold against `surface`.
 *
 * `faint` carries timestamps, paths, and counts — small but real information, so it
 * owes 4.5:1 like any other text. It was 0.585 and measured **3.36:1 against `bg`**
 * in every dark colorway; the light ramp was as bad. An earlier pass had checked
 * `text`, `muted`, and the border tokens and reported the palette verified, having
 * never measured the tier most likely to fail. Solved numerically per ramp for the
 * worst of bg / surface / raised across every colorway that uses it.
 */
const DARK_RAMP = {
  bg: 0.205,
  surface: 0.245,
  raised: 0.29,
  overlay: 0.32,
  line: 0.335,
  lineStrong: 0.565,
  text: 0.91,
  muted: 0.72,
  faint: 0.66,
} as const

/** Light ramp. Mirrors the dark one: same relationships, inverted. */
const LIGHT_RAMP = {
  bg: 0.955,
  surface: 0.985,
  raised: 0.925,
  overlay: 1.0,
  line: 0.885,
  lineStrong: 0.60,
  text: 0.29,
  muted: 0.475,
  faint: 0.515,
} as const

/**
 * The paper ramp.
 *
 * A third ramp rather than a warmer `LIGHT_RAMP`, because paper inverts the usual
 * light-mode relationship: the *page* is the brightest thing and panels sit
 * **darker** than it, the way a card laid on a desk is. The standard light ramp
 * does the opposite — white cards floating on grey — which is a screen convention,
 * not a physical one, and it's most of why light themes read as clinical.
 *
 * Text never reaches black. Ink on paper is a warm near-black around L≈0.30;
 * true black is what printing looks like when it's gone wrong.
 */
const PAPER_RAMP = {
  bg: 0.955,
  surface: 0.925,
  raised: 0.895,
  overlay: 0.985,
  line: 0.855,
  lineStrong: 0.58,
  text: 0.305,
  muted: 0.475,
  faint: 0.494,
} as const

type Recipe = {
  id: ColorwayId
  label: string
  scheme: 'dark' | 'light'
  /** Which lightness ramp to build from. Defaults by scheme. */
  ramp?: 'dark' | 'light' | 'paper'
  /** Hue of the neutrals. A trace of hue keeps greys from looking dead. */
  neutralHue: number
  /** Chroma of the neutrals. Higher = more tinted surfaces. Keep small. */
  neutralChroma: number
  accent: { l: number; c: number; h: number }
  semantic?: Partial<{ success: number; danger: number; warning: number }>
}

const RECIPES: readonly Recipe[] = [
  /*
   * Paper and Hearth carry the hand-drawn treatment.
   *
   * Their neutral chroma is an order of magnitude above the others (0.012–0.016 vs
   * 0.007). That is the whole difference between "grey" and "warm": a neutral with
   * no chroma reads as a rendered surface, and one with a trace of yellow-red reads
   * as a material. It's the same trick that stops dark greys looking dead, pushed
   * far enough to be felt rather than just measured.
   */
  {
    id: 'paper',
    label: 'Paper',
    scheme: 'light',
    ramp: 'paper',
    neutralHue: 75,
    neutralChroma: 0.016,
    // Ochre rather than blue. Blue is the default accent of every developer tool
    // ever made, and it's the single loudest "technical" signal in a palette.
    accent: { l: 0.52, c: 0.115, h: 55 },
    semantic: { danger: 28, warning: 70, success: 140 },
  },
  {
    id: 'hearth',
    label: 'Hearth',
    scheme: 'dark',
    neutralHue: 55,
    neutralChroma: 0.012,
    accent: { l: 0.74, c: 0.115, h: 62 },
    semantic: { danger: 28, warning: 75, success: 145 },
  },
  {
    id: 'slate',
    label: 'Slate',
    scheme: 'dark',
    neutralHue: 265,
    neutralChroma: 0.007,
    accent: { l: 0.7, c: 0.115, h: 250 },
  },
  {
    id: 'ink',
    label: 'Ink',
    scheme: 'dark',
    neutralHue: 285,
    neutralChroma: 0.014,
    accent: { l: 0.72, c: 0.115, h: 305 },
  },
  {
    id: 'nord',
    label: 'Nord',
    scheme: 'dark',
    neutralHue: 245,
    neutralChroma: 0.016,
    accent: { l: 0.75, c: 0.085, h: 225 },
  },
  {
    id: 'moss',
    label: 'Moss',
    scheme: 'dark',
    neutralHue: 155,
    neutralChroma: 0.012,
    accent: { l: 0.74, c: 0.11, h: 155 },
  },
  {
    id: 'parchment',
    label: 'Parchment',
    scheme: 'light',
    neutralHue: 85,
    neutralChroma: 0.01,
    accent: { l: 0.52, c: 0.12, h: 45 },
  },
] as const

const oklch = (l: number, c: number, h: number): string =>
  `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`

const RAMPS = { dark: DARK_RAMP, light: LIGHT_RAMP, paper: PAPER_RAMP } as const

function buildVars(recipe: Recipe): Record<string, string> {
  const ramp = RAMPS[recipe.ramp ?? (recipe.scheme === 'dark' ? 'dark' : 'light')]
  const h = recipe.neutralHue
  const c = recipe.neutralChroma
  const { accent } = recipe

  // Semantic hues are fixed so "error" reads as error in every colorway. Their
  // lightness follows the ramp's text level so they sit at comparable weight.
  const semanticL = recipe.scheme === 'dark' ? 0.72 : 0.5

  return {
    '--bg': oklch(ramp.bg, c, h),
    '--surface': oklch(ramp.surface, c, h),
    '--raised': oklch(ramp.raised, c * 1.1, h),
    '--overlay': oklch(ramp.overlay, c * 1.1, h),
    '--line': oklch(ramp.line, c * 1.2, h),
    '--line-strong': oklch(ramp.lineStrong, c * 1.2, h),
    '--text': oklch(ramp.text, c * 0.6, h),
    '--text-muted': oklch(ramp.muted, c * 1.2, h),
    '--text-faint': oklch(ramp.faint, c * 1.4, h),
    '--accent': oklch(accent.l, accent.c, accent.h),
    '--accent-contrast': oklch(
      recipe.scheme === 'dark' ? 0.19 : 0.99,
      c,
      accent.h,
    ),
    // A translucent accent wash for selected states — tinting a surface rather
    // than outlining it keeps selection quiet.
    '--accent-wash': `color-mix(in oklch, ${oklch(accent.l, accent.c, accent.h)} 16%, transparent)`,
    '--success': oklch(semanticL, 0.13, recipe.semantic?.success ?? 155),
    '--danger': oklch(semanticL, 0.16, recipe.semantic?.danger ?? 25),
    '--warning': oklch(semanticL, 0.12, recipe.semantic?.warning ?? 85),
    /*
     * Code has to be distinguishable from a user note at a glance — they're both
     * filled blocks in the same column. Dark themes sink it below the window;
     * light ones push it below `raised` and warm it, so it reads as a different
     * material rather than the same card at a different opacity.
     */
    '--code-bg': oklch(
      recipe.scheme === 'dark' ? ramp.bg - 0.02 : ramp.raised - 0.035,
      c * 1.3,
      h,
    ),
    /*
     * Ink strength for hand-drawn strokes.
     *
     * Drawn marks need more presence than a divider (they *are* the content) but
     * less than body text, or every squiggle competes with the words. Derived from
     * the ramp so it tracks the theme instead of being a magic colour.
     */
    '--ink': oklch(recipe.scheme === 'dark' ? ramp.muted : ramp.muted - 0.04, c * 1.6, h),
    '--ink-faint': oklch(ramp.faint, c * 1.8, h),
  }
}

export type Colorway = {
  id: ColorwayId
  label: string
  scheme: 'dark' | 'light'
  /** Swatch for the picker: [background, raised surface, accent]. */
  swatch: [string, string, string]
  vars: Record<string, string>
}

export const COLORWAYS: readonly Colorway[] = RECIPES.map((recipe) => {
  const vars = buildVars(recipe)
  return {
    id: recipe.id,
    label: recipe.label,
    scheme: recipe.scheme,
    swatch: [vars['--bg']!, vars['--raised']!, vars['--accent']!],
    vars,
  }
})

/**
 * The written face, for display text only.
 *
 * Used on the wordmark, section labels, and empty states — never on prose, panel
 * headers, or code. A handwritten face is a *voice*, and a voice reading you a
 * transcript for an hour is exhausting; used on six words a screen it makes the
 * app feel made by someone.
 *
 * A system stack rather than a bundled font: this is a personal macOS app, and
 * shipping a webfont means a binary in the repo and a licence to carry for a
 * treatment that touches a handful of strings. The final fallback is the body
 * face, so a machine with none of these degrades to plain text rather than to
 * something unintentionally comic.
 */
export const DISPLAY_STACK =
  '"Bradley Hand", "Noteworthy", "Marker Felt", "Segoe Print", var(--font-body)'

export type FontId = 'system' | 'grotesque' | 'serif' | 'mono'

export const FONT_STACKS: Record<FontId, { label: string; body: string; mono: string }> = {
  system: {
    label: 'System',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  grotesque: {
    label: 'Grotesque',
    body: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  serif: {
    label: 'Serif',
    body: 'Charter, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  mono: {
    label: 'Monospace',
    body: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
}

export type Appearance = {
  colorway: ColorwayId
  font: FontId
  /** Base font size in px. Everything else is relative, so this scales the UI. */
  fontSize: number
  /** Body line-height multiplier — the biggest lever on long-form readability. */
  lineHeight: number
  /** Transcript measure in ch. 45–75 is the readable range; ~66 is the classic. */
  measure: number
}

export const DEFAULT_APPEARANCE: Appearance = {
  colorway: 'paper',
  font: 'system',
  fontSize: 15,
  lineHeight: 1.65,
  // Wider than the classic 66ch. The transcript is left-aligned against a rail
  // rather than centred in the panel, so the measure sets where text *wraps*, not
  // how much of the window sits empty — and code and tables want the room.
  measure: 84,
}

/** Colorway ids that existed in earlier builds, mapped to their replacements. */
const LEGACY_COLORWAYS: Record<string, ColorwayId> = {
  graphite: 'slate',
  terminal: 'moss',
}

const LEGACY_FONTS: Record<string, FontId> = { 'inter-ish': 'grotesque' }

export function resolveColorway(id: string): Colorway {
  const mapped = LEGACY_COLORWAYS[id] ?? id
  return COLORWAYS.find((entry) => entry.id === mapped) ?? COLORWAYS[0]!
}

export function resolveFont(id: string): FontId {
  const mapped = LEGACY_FONTS[id] ?? id
  return mapped in FONT_STACKS ? (mapped as FontId) : 'system'
}

/**
 * Push appearance into the document. Called on load and on every change.
 *
 * Writes straight to `documentElement.style` rather than going through React, so
 * dragging the text-size slider restyles the app without re-rendering a transcript
 * that may be thousands of nodes deep.
 */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  const colorway = resolveColorway(appearance.colorway)

  for (const [name, value] of Object.entries(colorway.vars)) {
    root.style.setProperty(name, value)
  }

  const font = FONT_STACKS[resolveFont(appearance.font)]
  root.style.setProperty('--font-body', font.body)
  root.style.setProperty('--font-mono', font.mono)
  root.style.setProperty('--font-display', DISPLAY_STACK)
  root.style.setProperty('--font-size-base', `${appearance.fontSize}px`)
  root.style.setProperty('--line-height-body', String(appearance.lineHeight))
  root.style.setProperty('--measure', `${appearance.measure}ch`)

  // Lets the OS render scrollbars and native controls to match.
  root.style.colorScheme = colorway.scheme
  root.dataset.colorway = colorway.id
  // The paper grain has to multiply on light themes and screen on dark ones, and
  // CSS can't ask a variable what scheme it belongs to.
  root.dataset.scheme = colorway.scheme
}
