import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The 8 colors Claude Code recognizes on an agent's `color` frontmatter field. */
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as const

/**
 * Fixed Tailwind swatch classes rather than a computed `bg-${color}-500` —
 * Tailwind can't see dynamically built class names at build time and would
 * drop them from the compiled CSS.
 */
const SWATCH_CLASS: Record<(typeof COLORS)[number], string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  cyan: 'bg-cyan-500',
}

export function AgentColorSwatches({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div role="radiogroup" aria-label="Agent color" className="flex flex-wrap gap-2">
      {COLORS.map((color) => {
        const selected = value === color
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color}
            title={color}
            onClick={() => onChange(selected ? '' : color)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110',
              SWATCH_CLASS[color],
            )}
          >
            {selected ? <Check size={12} className="text-white drop-shadow" aria-hidden /> : null}
          </button>
        )
      })}
    </div>
  )
}
