import { Check } from 'lucide-react'
import { Dialog, DialogContent } from './ui/Dialog'
import { Field, Segmented, Select, Slider } from './ui/Field'
import { Button } from './ui/Button'
import { useAppearanceStore } from '@/stores/appearanceStore'
import {
  buildCustomColorway,
  COLORWAYS,
  CUSTOM_RECIPE_BOUNDS,
  FONT_STACKS,
  MEASURE_FULL,
  type CustomRecipe,
  type FontId,
} from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Appearance controls.
 *
 * Everything applies immediately — no Save button. These are reversible, low-stakes
 * preferences whose effect you can only judge by looking, so previewing on change
 * beats a confirm step.
 *
 * Swatches carry a check mark as well as a border, because selection must never be
 * communicated by colour alone.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const appearance = useAppearanceStore()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Appearance"
        description="Changes apply instantly and are saved for next launch."
      >
        <div className="flex flex-col gap-6">
          <Field label="Colorway">
            <div className="grid grid-cols-2 gap-2">
              {COLORWAYS.map((colorway) => (
                <ColorwaySwatchButton
                  key={colorway.id}
                  label={colorway.label}
                  swatch={colorway.swatch}
                  isActive={appearance.colorway === colorway.id}
                  onClick={() => appearance.set('colorway', colorway.id)}
                />
              ))}
              {/* Live-rendered from the current recipe once one exists, so the
                  tile itself previews what selecting it will apply — same as
                  every built-in swatch. Before that (first visit) it falls
                  back to a neutral placeholder rather than guessing a recipe. */}
              <ColorwaySwatchButton
                label="Custom"
                swatch={
                  appearance.custom
                    ? buildCustomColorway(appearance.custom).swatch
                    : (['var(--raised)', 'var(--overlay)', 'var(--text-faint)'] as const)
                }
                isActive={appearance.colorway === 'custom'}
                onClick={() => appearance.set('colorway', 'custom')}
              />
            </div>
          </Field>

          {appearance.colorway === 'custom' && appearance.custom ? (
            <CustomThemeEditor
              recipe={appearance.custom}
              onChange={(next) => appearance.set('custom', next)}
            />
          ) : null}

          <Field label="Typeface" htmlFor="font-select">
            <Select
              id="font-select"
              value={appearance.font}
              onChange={(value) => appearance.set('font', value as FontId)}
              options={Object.entries(FONT_STACKS).map(([id, font]) => ({
                value: id,
                label: font.label,
              }))}
            />
          </Field>

          <Field label={`Text size — ${appearance.fontSize}px`}>
            <Slider
              ariaLabel="Text size"
              value={appearance.fontSize}
              min={13}
              max={20}
              step={1}
              onChange={(value) => appearance.set('fontSize', value)}
            />
          </Field>

          <Field
            label={`Line height — ${appearance.lineHeight.toFixed(2)}`}
            hint="Looser lines are easier to track across long responses."
          >
            <Slider
              ariaLabel="Line height"
              value={appearance.lineHeight}
              min={1.3}
              max={2}
              step={0.05}
              onChange={(value) => appearance.set('lineHeight', value)}
            />
          </Field>

          <Field
            label={
              appearance.measure >= MEASURE_FULL
                ? 'Line width — full width'
                : `Line width — ${appearance.measure} characters`
            }
            hint="Responses fill the panel by default. Drag left to cap line length; 45–75 characters is the classic readable range."
          >
            <Slider
              ariaLabel="Line width"
              value={appearance.measure}
              min={52}
              max={MEASURE_FULL}
              step={2}
              onChange={(value) => appearance.set('measure', value)}
            />
          </Field>

          <div className="flex justify-end">
            <Button variant="outline" size="md" onClick={appearance.reset}>
              Reset to defaults
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One colorway tile: swatch, label, active state. Shared by built-ins and Custom. */
function ColorwaySwatchButton({
  label,
  swatch,
  isActive,
  onClick,
}: {
  label: string
  swatch: readonly [string, string, string]
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'flex h-12 items-center gap-3 rounded-lg px-3 text-left transition-colors duration-150',
        isActive ? 'bg-accent-wash' : 'hover:bg-raised',
      )}
    >
      {/* Inner radius = outer(12) - padding(12)... clamped to sm so the
          swatch still reads as a rounded chip rather than a square. */}
      <span className="flex shrink-0 overflow-hidden rounded-sm">
        {swatch.map((color, index) => (
          <span key={index} className="h-6 w-3" style={{ background: color }} aria-hidden />
        ))}
      </span>
      <span className="flex-1 truncate text-xs font-medium text-text">{label}</span>
      {isActive ? <Check size={14} className="shrink-0 text-accent" /> : null}
    </button>
  )
}

/**
 * The custom-recipe editor: every slider maps straight onto a `CustomRecipe`
 * field and calls `onChange` with the whole recipe, which the caller pushes
 * through `set('custom', ...)` — same live-apply-on-set pattern as every
 * other appearance control.
 *
 * Accent lightness bounds move with `scheme` (see `CUSTOM_RECIPE_BOUNDS` for
 * why), so switching light/dark reclamps the current value into the new
 * range instead of leaving it invalid or silently out of bounds.
 */
function CustomThemeEditor({
  recipe,
  onChange,
}: {
  recipe: CustomRecipe
  onChange: (recipe: CustomRecipe) => void
}) {
  const lBounds = CUSTOM_RECIPE_BOUNDS.accent.l[recipe.scheme]

  const setScheme = (scheme: 'light' | 'dark') => {
    const bounds = CUSTOM_RECIPE_BOUNDS.accent.l[scheme]
    onChange({
      ...recipe,
      scheme,
      accent: { ...recipe.accent, l: Math.min(bounds.max, Math.max(bounds.min, recipe.accent.l)) },
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-raised p-3">
      <Field label="Scheme">
        <Segmented
          aria-label="Custom theme scheme"
          value={recipe.scheme}
          onChange={setScheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Field>

      <Field label={`Neutral hue — ${Math.round(recipe.neutralHue)}°`}>
        <Slider
          ariaLabel="Neutral hue"
          value={recipe.neutralHue}
          min={CUSTOM_RECIPE_BOUNDS.neutralHue.min}
          max={CUSTOM_RECIPE_BOUNDS.neutralHue.max}
          step={1}
          onChange={(neutralHue) => onChange({ ...recipe, neutralHue })}
        />
      </Field>

      <Field label={`Neutral chroma — ${recipe.neutralChroma.toFixed(3)}`}>
        <Slider
          ariaLabel="Neutral chroma"
          value={recipe.neutralChroma}
          min={CUSTOM_RECIPE_BOUNDS.neutralChroma.min}
          max={CUSTOM_RECIPE_BOUNDS.neutralChroma.max}
          step={0.001}
          onChange={(neutralChroma) => onChange({ ...recipe, neutralChroma })}
        />
      </Field>

      <Field label={`Accent hue — ${Math.round(recipe.accent.h)}°`}>
        <Slider
          ariaLabel="Accent hue"
          value={recipe.accent.h}
          min={CUSTOM_RECIPE_BOUNDS.accent.h.min}
          max={CUSTOM_RECIPE_BOUNDS.accent.h.max}
          step={1}
          onChange={(h) => onChange({ ...recipe, accent: { ...recipe.accent, h } })}
        />
      </Field>

      <Field label={`Accent chroma — ${recipe.accent.c.toFixed(3)}`}>
        <Slider
          ariaLabel="Accent chroma"
          value={recipe.accent.c}
          min={CUSTOM_RECIPE_BOUNDS.accent.c.min}
          max={CUSTOM_RECIPE_BOUNDS.accent.c.max}
          step={0.001}
          onChange={(c) => onChange({ ...recipe, accent: { ...recipe.accent, c } })}
        />
      </Field>

      <Field
        label={`Accent lightness — ${recipe.accent.l.toFixed(2)}`}
        hint="Bounded to stay legible against this scheme's surfaces."
      >
        <Slider
          ariaLabel="Accent lightness"
          value={recipe.accent.l}
          min={lBounds.min}
          max={lBounds.max}
          step={0.01}
          onChange={(l) => onChange({ ...recipe, accent: { ...recipe.accent, l } })}
        />
      </Field>
    </div>
  )
}
