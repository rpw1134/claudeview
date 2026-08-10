import { cn } from '@/lib/utils'
import type { Colorway } from '@/lib/theme'

/**
 * One colorway, as the palette itself.
 *
 * The tile shows the three colors that decide how the app reads — window,
 * raised surface, accent — as stacked bands rather than a single dot, because
 * a theme is a *relationship* between surfaces and one swatch can't show one.
 * Colors come straight from the generated recipe, so a tile can never drift
 * from what selecting it produces.
 *
 * Selection is a ring *and* a bolder label: the tiles are all coloured, so
 * colour alone couldn't carry "chosen" here even if it were allowed to.
 */
export function ColorwayTile({
  colorway,
  selected,
  onSelect,
}: {
  colorway: Colorway
  selected: boolean
  onSelect: () => void
}) {
  const [bg, raised, accent] = colorway.swatch

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'hand-sm-2 group flex flex-col gap-2 p-2 text-left transition-colors',
        selected ? 'bg-accent-wash ring-1 ring-accent' : 'hover:bg-raised',
      )}
    >
      {/* Inline styles, deliberately: these are generated OKLCH values from the
          theme recipe, not tokens — there is no utility class for "this
          colorway's background". */}
      <span className="hand-sm-1 flex h-10 w-full overflow-hidden" aria-hidden>
        <span className="h-full flex-1" style={{ background: bg }} />
        <span className="h-full flex-1" style={{ background: raised }} />
        <span className="h-full w-1/3" style={{ background: accent }} />
      </span>
      <span
        className={cn(
          'px-0.5 text-xs transition-colors',
          selected ? 'font-medium text-text' : 'text-text-muted group-hover:text-text',
        )}
      >
        {colorway.label}
      </span>
    </button>
  )
}
