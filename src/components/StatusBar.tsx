import { AlertTriangle, FolderOpen, Settings2 } from 'lucide-react'
import type { PermissionMode, SessionStatus } from '@shared/ipc'
import type { Tab } from '@/types/session'
import { formatCost, shortenPath } from '@/lib/utils'
import { Button } from './ui/Button'
import { Select } from './ui/Field'

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
 * Permission mode lives here rather than buried in settings because it is the one
 * setting whose current value changes what the agent is allowed to do to your
 * machine — that should never require a click to discover.
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
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[11px] text-text-muted">
      <span className="shrink-0 font-medium text-text">{STATUS_LABEL[tab.status]}</span>

      {tab.cwd ? (
        <span className="flex min-w-0 shrink items-center gap-1" title={tab.cwd}>
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate font-mono">{shortenPath(tab.cwd, home)}</span>
        </span>
      ) : null}

      {tab.model ? <span className="shrink-0 font-mono">{tab.model}</span> : null}

      {tab.totalCostUsd > 0 ? (
        <span className="shrink-0 font-mono" title="Total session cost">
          {formatCost(tab.totalCostUsd)}
        </span>
      ) : null}

      {tab.lastError ? (
        <span className="flex min-w-0 items-center gap-1 text-danger" title={tab.lastError}>
          <AlertTriangle size={11} className="shrink-0" />
          <span className="truncate">{tab.lastError}</span>
        </span>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-text-faint">Permissions</span>
          <Select
            value={tab.permissionMode}
            onChange={(value) => onPermissionModeChange(value as PermissionMode)}
            options={PERMISSION_OPTIONS}
            className="h-6 w-32 text-[11px]"
          />
        </label>

        <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Appearance settings">
          <Settings2 size={13} />
        </Button>
      </div>
    </div>
  )
}
