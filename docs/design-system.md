# Design system

The scales every component draws from, and the reasoning behind them. If you add a
component, take its values from here rather than picking new ones.

---

## 0. The register: warm and drawn, not technical

The app defaults to **Paper**: warm cream ground, ink-brown text, ochre accent, a
faint fractal grain, and a handwritten face on a handful of display strings.

That's a deliberate reversal. The earlier palette was five cool greys with a blue
accent — the default register of every developer tool ever made, which is exactly
why it reads as *technical* rather than as something you'd want open all day. Three
things carry the change:

**Neutral chroma.** Paper and Hearth run their neutrals at 0.012–0.016 chroma
against 0.007 for the cool themes. A neutral with no chroma reads as a rendered
surface; one with a trace of yellow-red reads as a material. It's the same trick
that stops dark greys looking dead, pushed far enough to be *felt*.

**An ochre accent.** Blue is the single loudest technical signal a palette has.

**Paper inverts the depth relationship.** Its panels sit *darker* than the window,
the way a card laid on a desk does — the standard light mode does the opposite,
white cards floating on grey, which is a screen convention rather than a physical
one. It gets its own ramp (`PAPER_RAMP`) for that reason.

### Where "hand-drawn" is allowed

Accents and assets only — never prose, never panel headers, never code.

The written face in particular is on a hard budget: **two strings in the whole
app**. It reached eleven usages at one point — subtitles, field labels, the split
control, the activity label ticking away once a second — and a voice used that
often stops being a voice and becomes the typeface. If you're adding a third, the
answer is almost certainly no.

| Treatment | Where |
| --- | --- |
| The mark (`Mark.tsx`) | The activity line, the thinking toggle, the wordmark, the app icon |
| Written face (`--font-display`) | The wordmark, and one home-screen heading. Nothing else. |
| Uneven corners (`hand-1`, `hand-2`, `hand-sm-*`) | Panels, notes, buttons, the composer |
| Drawn rules (`Sketch.tsx`) | Section breaks |
| Paper grain | The window background |

Four *different* corner radii on one box is the cheapest convincing "drawn by a
person" cue there is — the eye reads the asymmetry long before it can name it, and
it costs one property rather than an SVG border-image per element.

### The mark

A six-armed asterisk with hand-set angles, arm lengths varying by up to 12%, and a
bow on each stroke. The asymmetry is functional as well as stylistic: a perfectly
symmetric asterisk has no legible rotation — spin it and it stutters between six
identical positions — so the `working` state needs uneven arms to read as turning.

Each arm is its own path, so the states are real animation rather than a spinner
swapped in: `idle` still, `thinking` breathing, `working` rotating, `writing`
rippling arm by arm, `failed` settled crooked. All `transform`/`opacity`, so eight
can run beside a streaming transcript without touching layout.

`scripts/make-icon.mjs` draws the same geometry at 1024px, so the dock icon and the
in-app mark are one drawing rather than two things that happen to match.

---

## 1. Surfaces — depth by fill, not by outline

Five levels, each a step on one lightness ramp:

| Token | Role |
| --- | --- |
| `--bg` | The window. The transcript sits directly on it. |
| `--surface` | Panels: toolbar, panel headers, expanded tool calls. |
| `--raised` | Controls and objects: buttons, active tabs, input fields. |
| `--overlay` | Floating things: dialogs, hover state on raised controls. |
| `--line` / `--line-strong` | Dividers / control boundaries. |

**The window does not start at black.** Near-black backgrounds make every glyph a
maximum-contrast event, which is what "too black" actually describes — the eye never
gets to rest. Body text sits at ~13.7:1 rather than ~16:1: still comfortably AAA,
noticeably calmer.

### `faint` was failing AA, in every colorway

`--text-faint` carries timestamps, paths, and token counts — small, but real
information, so it owes 4.5:1 like any other text. It measured **3.36:1** against
`--bg` on every dark colorway and 3.16:1 on the light one.

An earlier pass reported the palette contrast-verified. It had measured `text`,
`muted`, and the border tokens, and never measured the tier most likely to fail —
which is the tier most likely to fail. The values are now solved numerically per
ramp against the worst of `bg`/`surface`/`raised` across every colorway that uses
it (dark 0.585 → 0.66, light 0.60 → 0.515, paper 0.494), and all seven clear 4.5:1.

The cost is a tighter gap between `muted` and `faint` — three text tiers instead of
three very distinct ones. Correctness wins; hierarchy has size and weight too.

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

The transcript is a **chat thread**, and the agent gets the whole width.

Agent output — prose, code, tables, tool rows — runs edge to edge inside the panel's
gutter. No rail, no indent, no centred column. That output is what the app is for, so
anything insetting it is spending width on decoration. Your turns are the exception:
right-aligned, tinted, capped at 78% so they **cross the centreline** — capping at
half leaves a hard channel down the middle and squeezes a long message into a ribbon.

Side alone carries authorship, which is why the agent needs no marker per message.
Separation between turns is **vertical**: 32px above each of your messages and 20px
below, tighter spacing within a single response. Gestalt proximity does the grouping
a rail used to do, without costing any width.

Two earlier versions of this were wrong in opposite directions. `mx-auto` on a
`measure + 8rem` box left an empty margin on *both* sides, and the wider the panel
the more of it was nothing. Replacing that with a left rail for every row fixed the
centring but still indented the content and put a glyph above a glyph whenever a turn
both thought and spoke.

**The measure applies to paragraphs, not the container.** `--measure` caps `p`,
`ul`, `ol`, `blockquote` and headings inside `.prose-stream`; `pre` and `table` use
the full width. Capping the container punished code and tables for a rule that only
exists for running text.

Gutters are `@container` queries against the **panel** — **16 / 28 / 40px** — because
once you can split eight ways the window's width says nothing about how much room a
given panel has. The transcript, composer, lane tabs and reconnect row all use the
same three values, and the toolbar's right gutter is the widest of them plus the
mosaic's own 8px padding, so its last control lands on the same vertical line as the
content below it.

One trap that produced visible misalignment: **a width cap must wrap its gutter,
not the other way around.** Padding applied outside the cap offsets the element by
exactly the gutter width — measured at the time, prose at x=268 and the composer
shell at x=236.

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
