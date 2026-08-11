import { cn } from '@/lib/utils'

/** Source is the default: review is about reading changes, not reading prose. */
export type ReviewViewMode = 'source' | 'preview' | 'split'

const OPTIONS: { value: ReviewViewMode; label: string; title: string }[] = [
  { value: 'source', label: 'Source', title: 'Read the markdown as written' },
  { value: 'preview', label: 'Preview', title: 'Read the markdown as rendered' },
  { value: 'split', label: 'Split', title: 'Source and preview side by side' },
]

/**
 * Three-way view switch for markdown files, sized for the pane header.
 *
 * A local build rather than `ui/Field`'s `Segmented`, and the difference is only
 * density: that control is a form control — `text-sm`, `px-3`, `flex-1` — sized to
 * sit in a settings column next to labelled fields. This one lives in an 44px
 * header strip beside a filename, two count pills and two icon buttons, and at form
 * size it out-shouted the filename, which is the title of the view. Same grammar
 * (button group, `aria-pressed`, accent wash on the active one) at header scale, so
 * it still reads as the same family of control.
 *
 * Buttons carry `aria-pressed` rather than radio semantics for the reason the shared
 * control gives: a row of buttons doesn't implement arrow-key roving, and radio
 * semantics would promise that it does.
 *
 * Only rendered for markdown files. On a `.ts` file there is no second way to read
 * the content, and a control with one meaningful state is furniture.
 */
export function ViewModeToggle({
  value,
  onChange,
  className,
}: {
  value: ReviewViewMode
  onChange: (value: ReviewViewMode) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Markdown view"
      className={cn('hand-sm-2 flex shrink-0 items-stretch gap-0.5 bg-surface p-0.5', className)}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'hand-sm-1 whitespace-nowrap px-2 py-0.5 text-xs transition-colors',
            value === option.value
              ? 'bg-accent-wash text-text'
              : 'text-text-muted hover:bg-raised hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
