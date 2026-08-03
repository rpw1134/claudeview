/**
 * Colorways and typography.
 *
 * Every theme-able value is a CSS custom property set on `<html>`. Components
 * reference the semantic name (`--surface`, `--accent`) and never a literal color,
 * so switching a colorway is a single `style.setProperty` pass with no React
 * re-render and no flash — and adding a colorway means adding an entry here, not
 * touching any component.
 *
 * Colors are OKLCH: perceptually uniform, so a shared lightness reads as equally
 * bright across hues. That is what keeps a palette internally consistent instead of
 * having, say, the blue look heavier than the green at the same nominal value.
 */

export type ColorwayId = 'graphite' | 'ink' | 'parchment' | 'nord' | 'terminal'

export type Colorway = {
  id: ColorwayId
  label: string
  /** Whether the OS should draw scrollbars and form controls dark. */
  scheme: 'dark' | 'light'
  /** Swatch shown in the picker: [background, surface, accent]. */
  swatch: [string, string, string]
  vars: Record<string, string>
}

/**
 * Shared scale. Only hue/lightness differ between colorways, which is what keeps
 * them recognisably the same product rather than five unrelated skins.
 */
export const COLORWAYS: readonly Colorway[] = [
  {
    id: 'graphite',
    label: 'Graphite',
    scheme: 'dark',
    swatch: ['oklch(0.17 0.005 275)', 'oklch(0.22 0.006 275)', 'oklch(0.72 0.14 250)'],
    vars: {
      '--bg': 'oklch(0.17 0.005 275)',
      '--surface': 'oklch(0.21 0.006 275)',
      '--surface-raised': 'oklch(0.25 0.008 275)',
      '--border': 'oklch(0.31 0.008 275)',
      '--text': 'oklch(0.93 0.004 275)',
      '--text-muted': 'oklch(0.68 0.008 275)',
      '--text-faint': 'oklch(0.53 0.008 275)',
      '--accent': 'oklch(0.72 0.14 250)',
      '--accent-contrast': 'oklch(0.17 0.01 250)',
      '--success': 'oklch(0.74 0.15 155)',
      '--danger': 'oklch(0.66 0.19 22)',
      '--warning': 'oklch(0.79 0.14 80)',
      '--code-bg': 'oklch(0.15 0.006 275)',
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    scheme: 'dark',
    swatch: ['oklch(0.13 0.012 265)', 'oklch(0.18 0.016 265)', 'oklch(0.76 0.13 305)'],
    vars: {
      '--bg': 'oklch(0.13 0.012 265)',
      '--surface': 'oklch(0.17 0.016 265)',
      '--surface-raised': 'oklch(0.21 0.02 265)',
      '--border': 'oklch(0.28 0.022 265)',
      '--text': 'oklch(0.94 0.008 265)',
      '--text-muted': 'oklch(0.7 0.014 265)',
      '--text-faint': 'oklch(0.54 0.016 265)',
      '--accent': 'oklch(0.76 0.13 305)',
      '--accent-contrast': 'oklch(0.14 0.02 305)',
      '--success': 'oklch(0.76 0.14 160)',
      '--danger': 'oklch(0.68 0.19 15)',
      '--warning': 'oklch(0.81 0.13 85)',
      '--code-bg': 'oklch(0.11 0.014 265)',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    scheme: 'dark',
    swatch: ['oklch(0.26 0.02 260)', 'oklch(0.31 0.022 260)', 'oklch(0.79 0.08 230)'],
    vars: {
      '--bg': 'oklch(0.26 0.02 260)',
      '--surface': 'oklch(0.3 0.022 258)',
      '--surface-raised': 'oklch(0.35 0.024 256)',
      '--border': 'oklch(0.4 0.025 256)',
      '--text': 'oklch(0.93 0.012 250)',
      '--text-muted': 'oklch(0.75 0.018 250)',
      '--text-faint': 'oklch(0.6 0.02 252)',
      '--accent': 'oklch(0.79 0.08 230)',
      '--accent-contrast': 'oklch(0.24 0.02 230)',
      '--success': 'oklch(0.79 0.1 150)',
      '--danger': 'oklch(0.68 0.15 25)',
      '--warning': 'oklch(0.85 0.1 90)',
      '--code-bg': 'oklch(0.23 0.02 260)',
    },
  },
  {
    id: 'terminal',
    label: 'Terminal',
    scheme: 'dark',
    swatch: ['oklch(0.14 0.01 150)', 'oklch(0.18 0.014 150)', 'oklch(0.82 0.19 145)'],
    vars: {
      '--bg': 'oklch(0.14 0.01 150)',
      '--surface': 'oklch(0.18 0.014 150)',
      '--surface-raised': 'oklch(0.22 0.018 150)',
      '--border': 'oklch(0.3 0.03 150)',
      '--text': 'oklch(0.9 0.03 145)',
      '--text-muted': 'oklch(0.7 0.04 145)',
      '--text-faint': 'oklch(0.54 0.04 145)',
      '--accent': 'oklch(0.82 0.19 145)',
      '--accent-contrast': 'oklch(0.14 0.03 145)',
      '--success': 'oklch(0.85 0.19 145)',
      '--danger': 'oklch(0.68 0.2 25)',
      '--warning': 'oklch(0.84 0.15 90)',
      '--code-bg': 'oklch(0.11 0.012 150)',
    },
  },
  {
    id: 'parchment',
    label: 'Parchment',
    scheme: 'light',
    swatch: ['oklch(0.96 0.012 85)', 'oklch(0.99 0.006 85)', 'oklch(0.52 0.14 40)'],
    vars: {
      '--bg': 'oklch(0.96 0.012 85)',
      '--surface': 'oklch(0.99 0.006 85)',
      '--surface-raised': 'oklch(0.94 0.014 85)',
      '--border': 'oklch(0.86 0.018 85)',
      '--text': 'oklch(0.25 0.015 60)',
      '--text-muted': 'oklch(0.46 0.016 60)',
      '--text-faint': 'oklch(0.6 0.016 60)',
      '--accent': 'oklch(0.52 0.14 40)',
      '--accent-contrast': 'oklch(0.98 0.01 40)',
      '--success': 'oklch(0.5 0.13 155)',
      '--danger': 'oklch(0.52 0.19 25)',
      '--warning': 'oklch(0.6 0.13 75)',
      '--code-bg': 'oklch(0.93 0.014 85)',
    },
  },
] as const

export type FontId = 'system' | 'mono' | 'serif' | 'inter-ish'

export const FONT_STACKS: Record<FontId, { label: string; body: string; mono: string }> = {
  system: {
    label: 'System',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  'inter-ish': {
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
  /** Base font size in px. Everything else is in `rem`, so this scales the whole UI. */
  fontSize: number
  /** Body line-height multiplier — the biggest lever on long-form readability. */
  lineHeight: number
  /** Transcript max width in ch. ~70ch is the readable range for prose. */
  measure: number
}

export const DEFAULT_APPEARANCE: Appearance = {
  colorway: 'graphite',
  font: 'system',
  fontSize: 15,
  lineHeight: 1.65,
  measure: 78,
}

/**
 * Push appearance into the document. Called on load and on every change.
 *
 * Writing straight to `documentElement.style` rather than through React means
 * dragging the font-size slider re-styles the app without re-rendering the
 * transcript — which matters when the transcript is thousands of nodes deep.
 */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  const colorway = COLORWAYS.find((entry) => entry.id === appearance.colorway) ?? COLORWAYS[0]!

  for (const [name, value] of Object.entries(colorway.vars)) {
    root.style.setProperty(name, value)
  }

  const font = FONT_STACKS[appearance.font] ?? FONT_STACKS.system
  root.style.setProperty('--font-body', font.body)
  root.style.setProperty('--font-mono', font.mono)
  root.style.setProperty('--font-size-base', `${appearance.fontSize}px`)
  root.style.setProperty('--line-height-body', String(appearance.lineHeight))
  root.style.setProperty('--measure', `${appearance.measure}ch`)

  // Lets the OS render scrollbars/controls to match, which is the difference
  // between a themed app and an app with a themed <div>.
  root.style.colorScheme = colorway.scheme
  root.dataset.colorway = colorway.id
}
