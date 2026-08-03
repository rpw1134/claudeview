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

export type ColorwayId = 'slate' | 'ink' | 'nord' | 'moss' | 'parchment'

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
  faint: 0.585,
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
  faint: 0.6,
} as const

type Recipe = {
  id: ColorwayId
  label: string
  scheme: 'dark' | 'light'
  /** Hue of the neutrals. A trace of hue keeps greys from looking dead. */
  neutralHue: number
  /** Chroma of the neutrals. Higher = more tinted surfaces. Keep small. */
  neutralChroma: number
  accent: { l: number; c: number; h: number }
  semantic?: Partial<{ success: number; danger: number; warning: number }>
}

const RECIPES: readonly Recipe[] = [
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

function buildVars(recipe: Recipe): Record<string, string> {
  const ramp = recipe.scheme === 'dark' ? DARK_RAMP : LIGHT_RAMP
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
    '--code-bg': oklch(
      recipe.scheme === 'dark' ? ramp.bg - 0.02 : ramp.raised,
      c,
      h,
    ),
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
  colorway: 'slate',
  font: 'system',
  fontSize: 15,
  lineHeight: 1.6,
  measure: 72,
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
  root.style.setProperty('--font-size-base', `${appearance.fontSize}px`)
  root.style.setProperty('--line-height-body', String(appearance.lineHeight))
  root.style.setProperty('--measure', `${appearance.measure}ch`)

  // Lets the OS render scrollbars and native controls to match.
  root.style.colorScheme = colorway.scheme
  root.dataset.colorway = colorway.id
}
