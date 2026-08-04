# Design system

The scales every component draws from, and the reasoning behind them. If you add a
component, take its values from here rather than picking new ones.

---

## 1. Surfaces — depth by fill, not by outline

Five levels, each a step on one lightness ramp:

| Token | Role |
| --- | --- |
| `--bg` | The window. The transcript sits directly on it. |
| `--surface` | Panels: toolbar, panel headers, expanded tool calls. |
| `--raised` | Controls and objects: buttons, active tabs, user bubbles, input fields. |
| `--overlay` | Floating things: dialogs, hover state on raised controls. |
| `--line` / `--line-strong` | Dividers / control boundaries. |

**The window does not start at black.** Near-black backgrounds make every glyph a
maximum-contrast event, which is what "too black" actually describes — the eye never
gets to rest. Body text sits at ~13.7:1 rather than ~16:1: still comfortably AAA,
noticeably calmer.

### The border budget

> **At most one visible boundary per nesting chain.**

This is the rule that fixes "focuses inside focuses inside focuses". The old UI had
a bordered composer region containing a bordered input; a bordered card containing a
bordered field; bordered tool cards containing bordered sections. Each box drew its
own frame, so the eye had to parse three or four rectangles to find one control.

Where a boundary is allowed:

| Situation | Treatment |
| --- | --- |
| Region separator (composer vs transcript) | A single hairline `--line` rule. A rule is not a box. |
| Grouping related content | Fill + spacing. No border. |
| A card in a list | Fill on hover only. |
| **A form control** | 1px `--line-strong`. The one case a border is required. |
| Something floating | Elevation + dimmed backdrop. |

Form controls are the exception because WCAG 1.4.11 requires a perceivable boundary
where the edge is the only thing identifying the control. `--line-strong` is set so
it clears 3:1 against both `--surface` and `--raised` in every colorway.

Everywhere else, grouping comes from proximity and a shared fill (Gestalt: proximity
and common region). Space is cheaper than lines and always reads calmer.

---

## 2. Spacing — 8pt grid

Allowed values: **4, 8, 12, 16, 24, 32, 48**. In Tailwind: `1, 2, 3, 4, 6, 8, 12`.

Do not use `1.5` (6px), `2.5` (10px), `3.5` (14px), or `5` (20px). Odd and
off-scale values are why the old UI's gaps never quite lined up, and on fractional
DPI they land on half-pixels and blur.

**Internal ≤ external.** Space inside a group is tighter than the space separating
groups, so proximity alone shows what belongs together:

- 8px between a label and its control
- 16px between fields
- 24px between conversation turns
- 32px between page sections

### Alignment

Everything in the transcript column shares one left edge — prose, tool rows, the
thinking toggle, and the composer's input shell.

Two traps, both of which produced visible misalignment here:

1. **Padded rows need a negative margin.** A tool row with `px-3` insets its text
   12px from the prose. `-mx-3 px-3` puts the text back on the shared edge while
   the hover fill still extends past it.
2. **Put the padding on the max-width box, not the wrapper.** `Transcript` and
   `Composer` must apply `px-8` at the same level of their DOM. Padding the
   full-width wrapper instead makes the composer 32px wider per side than the prose
   column — subtle in isolation, obvious once you look for it.

---

## 3. Corner radius — scaled to element size

| Token | Value | Applies to |
| --- | --- | --- |
| `--radius-sm` | 4px | ≤24px: dots, chips, small icon buttons |
| `--radius-md` | 8px | 25–43px: buttons, selects, tabs |
| `--radius-lg` | 12px | ≥44px: cards, tool rows, resume rows |
| `--radius-xl` | 16px | Large panels, dialogs, the composer shell |

One global radius flattens hierarchy; tying it to size lets the radius say what kind
of thing you're looking at. Never mix rounded and sharp on sibling elements.

**Nesting: inner radius = outer radius − padding.** The composer shell is `xl` (16)
with `p-2` (8), so the send button inside is `md` (8). Reusing the outer radius on
an inner element leaves an optically uneven gap at the corners — the curves stop
being concentric.

---

## 4. Type

Set by the user in Appearance; the defaults are:

| Setting | Default | Range |
| --- | --- | --- |
| Size | 15px | 13–20 |
| Line height | 1.6 | 1.3–2.0 |
| Measure | 72ch | 52–100 |

45–75 characters per line is the readable range and ~66 is the classic optimum;
the slider allows wider but the default stays inside it.

Hierarchy comes from **weight and colour before size**. Three text tiers:

| Token | Use |
| --- | --- |
| `--text` | Assistant prose, headings, active labels |
| `--text-muted` | Secondary: user turns, tool names, status |
| `--text-faint` | Tertiary: timestamps, hints, collapsed metadata |

---

## 5. Attention

**Emphasis is relative — if everything is emphasized, nothing is.**

One focal point per view. On the start screen it's the New session button, the only
accent-filled element on screen. In a session it's the assistant's prose.

Reading order in the transcript, most to least prominent:

1. **Assistant prose** — full-contrast text at the reading measure
2. **User turns** — quiet raised bubble, muted text. You wrote it; it's a landmark
   for scanning, not something to re-read
3. **Tool calls / thinking** — faint, borderless, collapsed

The old UI inverted this: user bubbles and tool cards had borders *and* fills while
the assistant's text had neither, so the least important things carried the most
weight.

Accent colour is reserved for: the primary action, the streaming caret, active
selection, and links. It works *because* it's rare — spend it anywhere else and it
stops signalling.

Focus rings are `:focus-visible` only. A ring on every mouse click was a large part
of what made the old UI feel noisy; keyboard users still get a clear indicator.

---

## 6. Colour

Colorways are **generated**, not hand-picked. Each is declared as a hue plus a
chroma level in `src/lib/theme.ts`, and the full ramp is built from one shared
lightness scale. Hand-tuning five palettes is how contrast drifts — one theme ends
up harsher than another and "muted" means something different in each. Generating
them makes contrast identical across all five by construction (measured: 13.70–13.72:1
for body text in every dark colorway).

OKLCH throughout, because it's perceptually uniform: equal lightness reads as
equally bright across hues. In sRGB hex it does not, which is what makes hand-mixed
palettes feel subtly inconsistent.

### Adding a colorway

Add a `Recipe` to `RECIPES`. Nothing else changes — the picker maps over the array
and the ramp does the rest.

```ts
{
  id: 'ember',
  label: 'Ember',
  scheme: 'dark',
  neutralHue: 40,       // a trace of hue keeps greys from looking dead
  neutralChroma: 0.012, // keep small; this tints every surface
  accent: { l: 0.72, c: 0.13, h: 55 },
}
```

### Verifying contrast

The ramp is designed to pass, but verify after changing it. Every colorway is
checked against: body text AAA (7:1) on window and panel, secondary AA (4.5:1),
tertiary 3:1, accent AA, control boundaries 3:1 (WCAG 1.4.11), semantic colours AA,
and the label on the accent button.

Colour is never the only carrier of meaning — status dots pair with text labels,
selected swatches carry a check mark, risky permission modes show their name.
