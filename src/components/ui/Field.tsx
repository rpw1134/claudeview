import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

/**
 * Labelled form row.
 *
 * The label is always visible above the control. Placeholder-as-label is the most
 * common form accessibility failure: the label disappears as soon as the field has
 * a value, leaving no way to check what you typed.
 *
 * Spacing follows the internal-≤-external rule — 8px between a label and its
 * control, 16px+ between fields — so proximity alone shows what belongs together.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="font-display text-sm text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-text-faint">{hint}</p> : null}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  ariaLabel: string
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-8 w-full touch-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onValueChange={([next]) => {
        if (next !== undefined) onChange(next)
      }}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-raised">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      {/* 16px thumb: comfortably above the 3:1 boundary rule and easy to grab. */}
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full bg-accent transition-transform hover:scale-110" />
    </SliderPrimitive.Root>
  )
}

/**
 * Native select, styled to match. A control boundary that has to be perceivable,
 * so it carries a real border — but nothing around it does.
 */
export function Select({
  value,
  onChange,
  options,
  id,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  id?: string
  className?: string
  'aria-label'?: string
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-9 w-full hand-sm-2 border border-line-strong bg-raised px-3 text-sm text-text',
        'transition-colors hover:border-accent',
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
