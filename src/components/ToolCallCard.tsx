import { memo, useState } from 'react'
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileText,
  Globe,
  Loader2,
  Search,
  SquareTerminal,
  UserRoundCog,
  Wrench,
} from 'lucide-react'
import type { TranscriptItem } from '@/types/session'
import { cn } from '@/lib/utils'
import { Button } from './ui/Button'

type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Bash: SquareTerminal,
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Glob: Search,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  Task: UserRoundCog,
  Agent: UserRoundCog,
}

/**
 * A tool call, collapsed by default.
 *
 * ## Why this recedes
 *
 * Tool traffic is most of an agentic session by volume and almost never what you
 * are actually reading — the prose is. The old version gave every tool call a
 * bordered card, so a screen of tool calls out-shouted the answer sitting between
 * them. Emphasis is relative: making the transcript readable means actively
 * suppressing this, not just leaving it unstyled.
 *
 * So: no border, no fill at rest. It's a quiet row that gains a fill on hover and
 * only becomes a real surface once expanded. The expanded body is separated by a
 * hairline rule rather than by nesting a second bordered box inside the first.
 */
export const ToolCallCard = memo(function ToolCallCard({
  item,
  onOpenLane,
}: {
  item: ToolItem
  onOpenLane?: (laneId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICONS[item.name] ?? Wrench
  const summary = summarizeInput(item.input)

  return (
    <div
      className={cn(
        '-mx-3 my-1 overflow-hidden rounded-lg transition-colors duration-150',
        expanded ? 'bg-surface' : 'hover:bg-surface',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronRight
            size={14}
            className={cn(
              'shrink-0 text-text-faint transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
          <Icon size={14} className="shrink-0 text-text-faint" />
          <span className="shrink-0 font-mono text-xs text-text-muted">{item.name}</span>
          {summary ? (
            <span className="truncate font-mono text-xs text-text-faint">{summary}</span>
          ) : null}
        </button>

        <StatusGlyph status={item.status} />

        {item.spawnedLaneId && onOpenLane ? (
          <Button size="sm" variant="subtle" onClick={() => onOpenLane(item.spawnedLaneId!)}>
            Open
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-line px-3 py-3" data-selectable>
          <Section label="Input">
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-text-muted">
              {formatValue(item.input)}
            </pre>
          </Section>
          {item.preview ? (
            <Section label={item.status === 'error' ? 'Error' : 'Result'}>
              <pre
                className={cn(
                  'max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed',
                  item.status === 'error' ? 'text-danger' : 'text-text-muted',
                )}
              >
                {item.preview}
              </pre>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

/** Label + content. Grouped by proximity and a faint label — no box required. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-faint">
        {label}
      </div>
      {children}
    </div>
  )
}

function StatusGlyph({ status }: { status: ToolItem['status'] }) {
  if (status === 'running') {
    return <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-label="Running" />
  }
  if (status === 'error') {
    return <CircleAlert size={14} className="shrink-0 text-danger" aria-label="Failed" />
  }
  // Success is the common case, so it stays faint — a green tick on every row
  // would be a page full of "look here" with nothing to look at.
  return <CircleCheck size={14} className="shrink-0 text-text-faint" aria-label="Succeeded" />
}

/** Pull the most identifying argument out of a tool input for the collapsed row. */
function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>

  for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      const collapsed = value.replace(/\s+/g, ' ').trim()
      return collapsed.length > 100 ? `${collapsed.slice(0, 100)}…` : collapsed
    }
  }
  return ''
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
