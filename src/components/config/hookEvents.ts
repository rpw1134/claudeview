/**
 * The full Claude Code hook event catalog, with which optional fields each
 * event's groups support.
 *
 * `supportsMatcher` events fire for a specific tool (or `*`/empty for all) —
 * lifecycle events like `SessionStart` have no tool to match against, so a
 * matcher field on them would be a control with nothing to control.
 * `supportsIf` events can carry a conditional expression on the handler
 * itself (normalized in by `ConfigStore.normalizeGroup`); the rest fire
 * unconditionally by design.
 */
export type HookEventInfo = {
  id: string
  description: string
  supportsMatcher: boolean
  supportsIf: boolean
}

export const HOOK_EVENTS: HookEventInfo[] = [
  {
    id: 'SessionStart',
    description: 'Once when a session starts or resumes.',
    supportsMatcher: false,
    supportsIf: false,
  },
  {
    id: 'UserPromptSubmit',
    description: 'When you submit a prompt, before Claude sees it; can block or rewrite it.',
    supportsMatcher: false,
    supportsIf: false,
  },
  {
    id: 'PreToolUse',
    description: 'Before a tool call runs; can block or rewrite it.',
    supportsMatcher: true,
    supportsIf: true,
  },
  {
    id: 'PostToolUse',
    description: 'After a tool call completes successfully.',
    supportsMatcher: true,
    supportsIf: true,
  },
  {
    id: 'PostToolUseFailure',
    description: 'After a tool call fails.',
    supportsMatcher: true,
    supportsIf: true,
  },
  {
    id: 'PermissionRequest',
    description: 'When a tool call needs permission approval; can auto-decide it.',
    supportsMatcher: true,
    supportsIf: true,
  },
  {
    id: 'PermissionDenied',
    description: 'When a permission request is denied.',
    supportsMatcher: true,
    supportsIf: true,
  },
  {
    id: 'Notification',
    description: 'When Claude Code sends a system notification.',
    supportsMatcher: false,
    supportsIf: false,
  },
  {
    id: 'SubagentStart',
    description: 'When a subagent (Task tool) starts.',
    supportsMatcher: true,
    supportsIf: false,
  },
  {
    id: 'SubagentStop',
    description: 'When a subagent finishes.',
    supportsMatcher: true,
    supportsIf: false,
  },
  {
    id: 'Stop',
    description: 'When Claude finishes responding and is about to stop.',
    supportsMatcher: false,
    supportsIf: false,
  },
  {
    id: 'PreCompact',
    description: 'Before the transcript is compacted.',
    supportsMatcher: false,
    supportsIf: false,
  },
  {
    id: 'PostCompact',
    description: 'After the transcript is compacted.',
    supportsMatcher: false,
    supportsIf: false,
  },
  {
    id: 'SessionEnd',
    description: 'When a session ends.',
    supportsMatcher: false,
    supportsIf: false,
  },
]

export const hookEventInfo = (id: string): HookEventInfo =>
  HOOK_EVENTS.find((event) => event.id === id) ?? {
    id,
    description: '',
    supportsMatcher: true,
    supportsIf: true,
  }

/** Handler types the form renders dedicated fields for. Anything else falls back to JSON. */
export const KNOWN_HANDLER_TYPES = ['command', 'http'] as const
