import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { HooksConfig } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import { TextArea, TextInput, useSaveState } from './editorParts'

/**
 * The hooks editor: a visual list of matcher groups per event, plus a raw JSON
 * view for anything the form doesn't model (http/prompt/agent handlers, `if`
 * conditions, multiple handlers per group).
 *
 * The visual form deliberately edits only command hooks — the overwhelmingly
 * common kind — and passes everything else through untouched: a group it can't
 * render is shown as JSON inline rather than hidden, so switching tabs never
 * becomes the only way to know a hook exists.
 */

/** Events Claude Code fires, in rough lifecycle order. From the CLI's hook docs. */
const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'PreCompact',
  'PostCompact',
  'SessionEnd',
] as const

/** Events where a matcher (tool-name pattern) makes no sense. */
const NO_MATCHER = new Set(['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd'])

type Group = { matcher?: string; hooks?: unknown[]; [key: string]: unknown }

const isSimpleCommandGroup = (group: Group): boolean =>
  Array.isArray(group.hooks) &&
  group.hooks.length === 1 &&
  typeof group.hooks[0] === 'object' &&
  group.hooks[0] !== null &&
  (group.hooks[0] as Record<string, unknown>).type === 'command' &&
  typeof (group.hooks[0] as Record<string, unknown>).command === 'string'

export function HooksEditor({ projectPath }: { projectPath: string }) {
  const [loaded, setLoaded] = useState<HooksConfig | null>(null)
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [view, setView] = useState<'visual' | 'json'>('visual')
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [addingEvent, setAddingEvent] = useState<string>('PreToolUse')
  const save = useSaveState()

  useEffect(() => {
    api['config:hooks:get']({ projectPath })
      .then((found) => {
        setLoaded(found)
        setHooks(found)
      })
      .catch(() => {
        setLoaded({})
        setHooks({})
      })
  }, [projectPath])

  const dirty = useMemo(
    () => loaded !== null && JSON.stringify(hooks) !== JSON.stringify(loaded),
    [hooks, loaded],
  )

  if (loaded === null) return null

  const persist = (next: HooksConfig) =>
    save.run(async () => {
      await api['config:hooks:set']({ projectPath, hooks: next })
      setLoaded(next)
    })

  const enterJson = () => {
    setJsonDraft(JSON.stringify(hooks, null, 2))
    setJsonError(null)
    setView('json')
  }

  const leaveJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as HooksConfig
      setHooks(parsed)
      setJsonError(null)
      setView('visual')
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON')
    }
  }

  const updateGroup = (event: string, index: number, patch: Partial<Group>) => {
    setHooks((current) => ({
      ...current,
      [event]: (current[event] ?? []).map((group, i) =>
        i === index ? { ...(group as Group), ...patch } : group,
      ),
    }))
  }

  const removeGroup = (event: string, index: number) => {
    setHooks((current) => {
      const remaining = (current[event] ?? []).filter((_, i) => i !== index)
      const next = { ...current }
      if (remaining.length === 0) delete next[event]
      else next[event] = remaining
      return next
    })
  }

  const addGroup = () => {
    setHooks((current) => ({
      ...current,
      [addingEvent]: [
        ...(current[addingEvent] ?? []),
        { matcher: '', hooks: [{ type: 'command', command: '' }] },
      ],
    }))
  }

  const events = Object.keys(hooks).sort(
    (a, b) => HOOK_EVENTS.indexOf(a as never) - HOOK_EVENTS.indexOf(b as never),
  )

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          {(['visual', 'json'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (mode === view) return
                if (mode === 'json') enterJson()
                else leaveJson()
              }}
              aria-current={view === mode ? 'true' : undefined}
              className={cn(
                'hand-sm-1 px-2 py-1 text-xs transition-colors',
                view === mode
                  ? 'bg-accent-wash text-text'
                  : 'text-text-muted hover:bg-raised hover:text-text',
              )}
            >
              {mode === 'visual' ? 'Visual' : 'JSON'}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-faint" role="status">
          {save.state === 'saving'
            ? 'Saving…'
            : save.state === 'error'
              ? 'Save failed'
              : save.state === 'saved'
                ? 'Saved'
                : dirty
                  ? 'Edited'
                  : ''}
        </span>
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={!dirty || view === 'json'}
          onClick={() => persist(hooks)}
        >
          Save
        </Button>
      </div>

      {view === 'json' ? (
        <>
          <TextArea value={jsonDraft} onChange={setJsonDraft} rows={20} mono aria-label="Hooks JSON" />
          {jsonError ? <p className="text-xs text-danger">{jsonError}</p> : null}
          <p className="text-xs text-text-faint">
            Switch back to Visual to apply — the JSON must parse first.
          </p>
        </>
      ) : (
        <>
          {events.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-text-faint">
              No hooks in this scope yet.
            </p>
          ) : (
            events.map((event) => (
              <section key={event} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-text-muted">{event}</h3>
                {(hooks[event] ?? []).map((raw, index) => {
                  const group = raw as Group
                  return (
                    <div
                      key={index}
                      className="flex flex-col gap-2 hand-sm-1 border border-line bg-surface p-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          {NO_MATCHER.has(event) ? null : (
                            <Field label="Matcher" hint="Tool-name pattern, e.g. Bash or Edit|Write. Empty matches all.">
                              <TextInput
                                mono
                                value={typeof group.matcher === 'string' ? group.matcher : ''}
                                onChange={(matcher) => updateGroup(event, index, { matcher })}
                                aria-label={`${event} matcher`}
                              />
                            </Field>
                          )}
                          {isSimpleCommandGroup(group) ? (
                            <Field label="Command">
                              <TextInput
                                mono
                                value={(group.hooks![0] as { command: string }).command}
                                onChange={(command) =>
                                  updateGroup(event, index, {
                                    hooks: [{ ...(group.hooks![0] as object), command }],
                                  })
                                }
                                aria-label={`${event} command`}
                              />
                            </Field>
                          ) : (
                            <Field
                              label="Handlers"
                              hint="This group is more than one plain command — edit it in the JSON view."
                            >
                              <pre className="overflow-x-auto hand-sm-2 bg-code-bg p-2 font-mono text-xs text-text-muted">
                                {JSON.stringify(group.hooks, null, 2)}
                              </pre>
                            </Field>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroup(event, index)}
                          aria-label={`Remove ${event} hook`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </section>
            ))
          )}

          <div className="flex items-center gap-2 border-t border-line pt-3">
            <div className="w-52">
              <Select
                aria-label="Hook event"
                value={addingEvent}
                onChange={setAddingEvent}
                options={HOOK_EVENTS.map((event) => ({ value: event, label: event }))}
                className="h-8 text-xs"
              />
            </div>
            <Button variant="subtle" size="sm" onClick={addGroup}>
              <Plus size={12} /> Add hook
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
