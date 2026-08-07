import { Check } from 'lucide-react'
import { Dialog, DialogContent } from './ui/Dialog'
import { Field, Select, Slider } from './ui/Field'
import { Button } from './ui/Button'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { COLORWAYS, FONT_STACKS, MEASURE_FULL, type FontId } from '@/lib/theme'
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
              {COLORWAYS.map((colorway) => {
                const isActive = appearance.colorway === colorway.id
                return (
                  <button
                    key={colorway.id}
                    onClick={() => appearance.set('colorway', colorway.id)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex h-12 items-center gap-3 rounded-lg px-3 text-left transition-colors duration-150',
                      isActive ? 'bg-accent-wash' : 'hover:bg-raised',
                    )}
                  >
                    {/* Inner radius = outer(12) - padding(12)... clamped to sm so the
                        swatch still reads as a rounded chip rather than a square. */}
                    <span className="flex shrink-0 overflow-hidden rounded-sm">
                      {colorway.swatch.map((color, index) => (
                        <span
                          key={index}
                          className="h-6 w-3"
                          style={{ background: color }}
                          aria-hidden
                        />
                      ))}
                    </span>
                    <span className="flex-1 truncate text-xs font-medium text-text">
                      {colorway.label}
                    </span>
                    {isActive ? <Check size={14} className="shrink-0 text-accent" /> : null}
                  </button>
                )
              })}
            </div>
          </Field>

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
