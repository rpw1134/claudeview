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
 * Tool traffic is the bulk of an agentic session by volume but rarely what the user
 * is reading — they want the prose, with the option to inspect what happened.
 * Collapsed-with-a-one-line-summary keeps the transcript scannable; the summary line
 * carries the single most identifying argument (the command, the path, the pattern)
 * so it's usually enough on its own.
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
    <div className="my-1.5 overflow-hidden rounded-lg border border-border bg-surface/60">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronRight
            size={13}
            className={cn(
              'shrink-0 text-text-faint transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
          <Icon size={13} className="shrink-0 text-text-muted" />
          <span className="shrink-0 font-mono text-xs font-medium text-text">{item.name}</span>
          {summary ? (
            <span className="truncate font-mono text-[11px] text-text-faint">{summary}</span>
          ) : null}
        </button>

        <StatusGlyph status={item.status} />

        {item.spawnedLaneId && onOpenLane ? (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => onOpenLane(item.spawnedLaneId!)}
            className="shrink-0"
          >
            Open transcript
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-border bg-code-bg/60 px-2.5 py-2">
          <Section label="Input">
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-text-muted">
              {formatValue(item.input)}
            </pre>
          </Section>
          {item.preview ? (
            <Section label={item.status === 'error' ? 'Error' : 'Result'}>
              <pre
                className={cn(
                  'max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed',
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0" data-selectable>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
        {label}
      </div>
      {children}
    </div>
  )
}

function StatusGlyph({ status }: { status: ToolItem['status'] }) {
  if (status === 'running') {
    return <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-label="Running" />
  }
  if (status === 'error') {
    return <CircleAlert size={13} className="shrink-0 text-danger" aria-label="Failed" />
  }
  return <CircleCheck size={13} className="shrink-0 text-success" aria-label="Succeeded" />
}

/** Pull the most identifying argument out of a tool input for the collapsed line. */
function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>

  for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      const collapsed = value.replace(/\s+/g, ' ').trim()
      return collapsed.length > 110 ? `${collapsed.slice(0, 110)}…` : collapsed
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
