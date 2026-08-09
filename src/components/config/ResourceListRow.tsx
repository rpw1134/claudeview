/**
 * One agent/skill row: name, description once it's fetched, and an agent's
 * model badge if set. Quiet by design — hover fill only, no border — a list
 * of these is a set (Gestalt similarity), not a stack of cards.
 */
export function ResourceListRow({
  name,
  description,
  model,
  onOpen,
}: {
  name: string
  description?: string
  model?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-0.5 hand-sm-1 px-3 py-2.5 text-left transition-colors hover:bg-raised"
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-sm text-text">{name}</span>
        {model ? (
          <span className="shrink-0 hand-sm-1 bg-accent-wash px-1.5 py-0.5 text-xs font-medium text-text">
            {model}
          </span>
        ) : null}
      </span>
      <span className="truncate text-xs text-text-muted">{description || ' '}</span>
    </button>
  )
}
