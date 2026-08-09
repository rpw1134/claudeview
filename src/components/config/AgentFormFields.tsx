import { Field, Select, Toggle } from '@/components/ui/Field'
import { TextArea, TextInput } from './editorParts'
import { AgentColorSwatches } from './AgentColorSwatches'

const MODEL_OPTIONS = [
  { value: '', label: 'Inherit' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
]

const PERMISSION_OPTIONS = [
  { value: '', label: 'Inherit' },
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'auto', label: 'Auto' },
  { value: 'plan', label: 'Plan' },
  { value: 'bypassPermissions', label: 'Bypass permissions' },
]

const EFFORT_OPTIONS = [
  { value: '', label: 'Inherit' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
]

const MEMORY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'user', label: 'User' },
  { value: 'project', label: 'Project' },
  { value: 'local', label: 'Local' },
]

export type AgentFormState = {
  description: string
  model: string
  permissionMode: string
  tools: string
  disallowedTools: string
  color: string
  effort: string
  memory: string
  background: boolean
  isolation: boolean
  maxTurns: string
  body: string
}

/**
 * The agent form fields, as a pure presentational block — all state and the
 * frontmatter round-trip live in `AgentEditor`. Split out mainly so that file
 * stays a save/load/raw-toggle orchestrator rather than a 300-line form.
 */
export function AgentFormFields({
  state,
  set,
}: {
  state: AgentFormState
  set: <K extends keyof AgentFormState>(key: K, value: AgentFormState[K]) => void
}) {
  return (
    <>
      <Field label="Description" hint="When should Claude delegate to this agent?">
        <TextArea value={state.description} onChange={(v) => set('description', v)} rows={2} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Model">
          <Select
            aria-label="Model"
            value={state.model}
            onChange={(v) => set('model', v)}
            options={MODEL_OPTIONS}
          />
        </Field>
        <Field label="Permission mode">
          <Select
            aria-label="Permission mode"
            value={state.permissionMode}
            onChange={(v) => set('permissionMode', v)}
            options={PERMISSION_OPTIONS}
          />
        </Field>
        <Field label="Effort">
          <Select
            aria-label="Effort"
            value={state.effort}
            onChange={(v) => set('effort', v)}
            options={EFFORT_OPTIONS}
          />
        </Field>
        <Field label="Memory" hint="Where this agent's own notes-to-self persist.">
          <Select
            aria-label="Memory"
            value={state.memory}
            onChange={(v) => set('memory', v)}
            options={MEMORY_OPTIONS}
          />
        </Field>
      </div>

      <Field label="Color">
        <AgentColorSwatches value={state.color} onChange={(v) => set('color', v)} />
      </Field>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Toggle
          checked={state.background}
          onChange={(v) => set('background', v)}
          label="Runs in the background"
        />
        <Toggle
          checked={state.isolation}
          onChange={(v) => set('isolation', v)}
          label="Run in isolated worktree"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tools" hint="Comma-separated. Empty means all tools.">
          <TextInput
            value={state.tools}
            onChange={(v) => set('tools', v)}
            mono
            placeholder="Read, Grep, Bash"
          />
        </Field>
        <Field label="Disallowed tools" hint="Comma-separated. Overrides the allow list above.">
          <TextInput
            value={state.disallowedTools}
            onChange={(v) => set('disallowedTools', v)}
            mono
            placeholder="Bash(rm*)"
          />
        </Field>
      </div>

      <Field label="Max turns" hint="Empty means unlimited." className="max-w-40">
        <input
          type="number"
          min={1}
          value={state.maxTurns}
          onChange={(event) => set('maxTurns', event.target.value)}
          aria-label="Max turns"
          className="h-9 w-full hand-sm-2 border border-line-strong bg-raised px-3 text-sm text-text transition-colors hover:border-accent"
        />
      </Field>

      <Field label="System prompt">
        <TextArea value={state.body} onChange={(v) => set('body', v)} rows={16} mono />
      </Field>
    </>
  )
}
