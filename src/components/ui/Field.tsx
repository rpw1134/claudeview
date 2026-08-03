import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

/**
 * Labelled form row.
 *
 * The label is always visible and rendered above the control. Placeholder-as-label
 * is the single most common form accessibility failure: the label vanishes the
 * moment the field has a value, leaving the user unable to check what they typed.
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
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-text-faint">{hint}</p> : null}
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
      className="relative flex h-5 w-full touch-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onValueChange={([next]) => {
        if (next !== undefined) onChange(next)
      }}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-border">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-3.5 w-3.5 rounded-full border-2 border-accent bg-surface
                   transition-transform hover:scale-110 focus-visible:outline-2
                   focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </SliderPrimitive.Root>
  )
}

/** Native select, styled. Sufficient for short, familiar option sets. */
export function Select({
  value,
  onChange,
  options,
  id,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  id?: string
  className?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-8 w-full rounded-md border border-border bg-surface-raised px-2 text-sm text-text',
        'transition-colors hover:border-text-faint focus-visible:outline-2 focus-visible:outline-accent',
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
