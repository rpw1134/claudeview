import { Check } from 'lucide-react'
import { Dialog, DialogContent } from './ui/Dialog'
import { Field, Select, Slider } from './ui/Field'
import { Button } from './ui/Button'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { COLORWAYS, FONT_STACKS, type FontId } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Appearance controls.
 *
 * Every control applies immediately — no Save button. These are reversible,
 * low-stakes, visual preferences whose effect you can only judge by looking at the
 * result, so previewing on change is strictly better than a confirm step.
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
        <div className="flex flex-col gap-5">
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
                      'flex items-center gap-2.5 rounded-lg border p-2 text-left transition-colors',
                      isActive
                        ? 'border-accent bg-surface-raised'
                        : 'border-border hover:bg-surface-raised',
                    )}
                  >
                    <span className="flex shrink-0 overflow-hidden rounded-md border border-border">
                      {colorway.swatch.map((color, index) => (
                        <span
                          key={index}
                          className="h-6 w-3"
                          style={{ background: color }}
                          aria-hidden
                        />
                      ))}
                    </span>
                    <span className="flex-1 text-xs font-medium text-text">{colorway.label}</span>
                    {isActive ? <Check size={13} className="shrink-0 text-accent" /> : null}
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
              min={12}
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
            label={`Line width — ${appearance.measure}ch`}
            hint="Around 65–80 characters per line is the comfortable range for reading prose."
          >
            <Slider
              ariaLabel="Line width"
              value={appearance.measure}
              min={54}
              max={120}
              step={2}
              onChange={(value) => appearance.set('measure', value)}
            />
          </Field>

          <div className="flex justify-end border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={appearance.reset}>
              Reset to defaults
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
