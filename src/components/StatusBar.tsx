import { AlertTriangle, FolderOpen, Settings2 } from 'lucide-react'
import type { PermissionMode, SessionStatus } from '@shared/ipc'
import type { Tab } from '@/types/session'
import { compactTokens, shortenPath } from '@/lib/utils'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<SessionStatus, string> = {
  starting: 'Starting…',
  ready: 'Ready',
  idle: 'Idle',
  thinking: 'Thinking…',
  streaming: 'Responding…',
  tool: 'Running tool…',
  error: 'Error',
  closed: 'Ended',
}

const PERMISSION_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'default', label: 'Ask' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'dontAsk', label: "Don't ask" },
  { value: 'bypassPermissions', label: 'Bypass' },
]

/**
 * Session state, always visible.
 *
 * The whole bar is tertiary information, so it sits at `text-faint`/`text-muted`
 * and carries no borders of its own — a hairline separates it from the transcript
 * and that's the entire boundary budget for this region.
 *
 * Permission mode lives here rather than in settings because it's the one setting
 * that changes what the agent may do to your machine; that should never require a
 * click to discover. It's rendered borderless until hover so it doesn't read as a
 * third focal point in a 32px-tall strip.
 */
export function StatusBar({
  tab,
  home,
  onPermissionModeChange,
  onOpenSettings,
}: {
  tab: Tab
  home?: string
  onPermissionModeChange: (mode: PermissionMode) => void
  onOpenSettings: () => void
}) {
  const isRisky = tab.permissionMode === 'bypassPermissions' || tab.permissionMode === 'dontAsk'
  const totalTokens =
    tab.usage.inputTokens + tab.usage.outputTokens + tab.usage.cacheReadTokens

  return (
    <div className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 text-xs text-text-faint">
      <span className="shrink-0 text-text-muted">{STATUS_LABEL[tab.status]}</span>

      {tab.cwd ? (
        <span className="flex min-w-0 shrink items-center gap-2" title={tab.cwd}>
          <FolderOpen size={12} className="shrink-0" />
          <span className="truncate font-mono">{shortenPath(tab.cwd, home)}</span>
        </span>
      ) : null}

      {tab.model ? <span className="shrink-0 truncate font-mono">{tab.model}</span> : null}

      {/*
        Token usage, not cost. Cache reads are shown separately from fresh input:
        in an agentic loop they dominate the input count, so folding them together
        produces an alarming number that means nothing.
      */}
      {totalTokens > 0 ? (
        <span
          className="shrink-0 font-mono"
          title={`Input ${tab.usage.inputTokens.toLocaleString()} · Output ${tab.usage.outputTokens.toLocaleString()} · Cache read ${tab.usage.cacheReadTokens.toLocaleString()} · Cache write ${tab.usage.cacheCreationTokens.toLocaleString()}`}
        >
          {compactTokens(tab.usage.inputTokens)} in · {compactTokens(tab.usage.outputTokens)} out
          {tab.usage.cacheReadTokens > 0
            ? ` · ${compactTokens(tab.usage.cacheReadTokens)} cached`
            : ''}
        </span>
      ) : null}

      {tab.lastError ? (
        <span className="flex min-w-0 items-center gap-2 text-danger" title={tab.lastError}>
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{tab.lastError}</span>
        </span>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/*
          Borderless until hover. A permanently outlined control in a 32px strip
          reads as a competing focal point; the label to its left already says
          what it is. Risky modes tint the text — colour plus the visible mode
          name, never colour alone.
        */}
        <select
          aria-label="Permission mode"
          value={tab.permissionMode}
          onChange={(event) => onPermissionModeChange(event.target.value as PermissionMode)}
          className={cn(
            'h-6 rounded-sm border border-transparent bg-transparent px-2 text-xs',
            'transition-colors hover:border-line hover:bg-raised',
            isRisky ? 'text-warning' : 'text-text-muted',
          )}
        >
          {PERMISSION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="Appearance settings"
          title="Appearance (⌘,)"
        >
          <Settings2 size={14} />
        </Button>
      </div>
    </div>
  )
}
