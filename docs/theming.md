# Theming

## How it works

Every theme-able value is a CSS custom property on `<html>`. Components reference
semantic names (`--surface`, `--accent`) and never a literal color.

Tailwind tokens point at those variables rather than at fixed values:

```css
@theme {
  --color-surface: var(--surface);
  --color-accent: var(--accent);
}
```

So `bg-surface` compiles to `background-color: var(--surface)`. Switching a colorway
is one `style.setProperty` pass on the root element — no rebuild, no React
re-render, no class swapping, no flash.

`applyAppearance()` in `src/lib/theme.ts` is the only writer, and it's called
directly from the store setters rather than from a component effect. That's why
dragging the font-size slider restyles the app without re-rendering a transcript
that may be thousands of nodes deep.

## Why OKLCH

All colors are OKLCH, which is perceptually uniform: two colors with the same
lightness *look* equally bright regardless of hue. In sRGB hex they don't — a
nominally "same value" blue and green read as different weights, which is what makes
hand-tuned palettes feel subtly inconsistent.

The colorways share one lightness/chroma scale and differ mainly in hue. That's what
keeps them recognisably the same product rather than five unrelated skins.

## Tokens

| Token | Role |
| --- | --- |
| `--bg` | Window background, furthest back |
| `--surface` | Panels, tab strip, composer |
| `--surface-raised` | Controls, active tab, user message bubbles |
| `--border` | Hairlines and dividers |
| `--text` / `--text-muted` / `--text-faint` | Primary / secondary / tertiary text |
| `--accent` / `--accent-contrast` | Primary actions, links, caret / text on accent |
| `--success` / `--danger` / `--warning` | Tool status, errors |
| `--code-bg` | Code block background |

Typography and layout: `--font-body`, `--font-mono`, `--font-size-base`,
`--line-height-body`, `--measure`.

## Adding a colorway

Add an entry to `COLORWAYS` in `src/lib/theme.ts`. Nothing else needs to change —
the settings picker maps over the array.

```ts
{
  id: 'solarized',
  label: 'Solarized',
  scheme: 'dark',
  swatch: ['oklch(0.22 0.03 210)', 'oklch(0.27 0.03 210)', 'oklch(0.72 0.13 55)'],
  vars: { '--bg': '…', /* every token above */ },
}
```

Two things to get right:

- **`scheme`** sets `color-scheme`, which tells the OS to draw scrollbars and form
  controls to match. Without it you get a light scrollbar on a dark app — the
  difference between a themed app and an app with a themed `<div>`.
- **Contrast.** `--text` on `--bg` should reach 7:1 (WCAG AAA for body text);
  `--text-muted` at least 4.5:1. `--text-faint` is for decorative and incidental
  text only. Check the accent against both `--bg` and `--surface`, since it's used
  on both.

## Typography controls

| Control | Range | Notes |
| --- | --- | --- |
| Typeface | 4 stacks | System, Grotesque, Serif, Monospace |
| Text size | 12–20px | Scales the whole UI; everything else is in `rem`/`em` |
| Line height | 1.3–2.0 | The biggest lever on long-form readability |
| Line width | 54–120ch | ~65–80ch is the comfortable range for prose |

All stacks are system fonts. No web fonts: the app ships no network access, and a
bundled font file would cost startup for a marginal gain.

## Persistence

`appearanceStore` persists to `localStorage` under `claudeview.appearance` via
zustand's `persist` middleware. `onRehydrateStorage` calls `applyAppearance` so
settings apply before first paint; `src/main.tsx` also applies defaults
synchronously so the very first frame is themed rather than showing the CSS
fallbacks in `index.css`.

## Markdown scoping

Model-authored HTML renders inside `.prose-stream`. All markdown styles are scoped
under that class so model output can never restyle the app chrome — a response
containing a `<style>` block is stripped by DOMPurify, but scoping means even
allowed elements stay contained.
