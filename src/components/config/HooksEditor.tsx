import { useEffect, useMemo, useState } from 'react'
import type { HooksConfig } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { TextArea, useSaveState } from './editorParts'
import { HOOK_EVENTS, hookEventInfo } from './hookEvents'
import { HookGroupCard, type Group } from './HookGroupCard'
import { HookEventPicker } from './HookEventPicker'

/**
 * The hooks editor: a visual list of matcher groups per event, plus a raw
 * JSON view for anything the form doesn't model.
 *
 * Every group and handler this form doesn't have a field for is preserved by
 * spreading the original object and overriding only the edited keys — see
 * `HookGroupCard` / `HookHandlerFields` — so switching tabs is never the only
 * way to keep a hand-written hook intact.
 */
export function HooksEditor({ projectPath }: { projectPath: string }) {
  const [loaded, setLoaded] = useState<HooksConfig | null>(null)
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [view, setView] = useState<'visual' | 'json'>('visual')
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
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

  const updateGroup = (event: string, index: number, next: Group) => {
    setHooks((current) => ({
      ...current,
      [event]: (current[event] ?? []).map((group, i) => (i === index ? next : group)),
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

  const addGroup = (event: string) => {
    setHooks((current) => ({
      ...current,
      [event]: [...(current[event] ?? []), { matcher: '', hooks: [{ type: 'command', command: '' }] }],
    }))
  }

  const events = Object.keys(hooks).sort(
    (a, b) => HOOK_EVENTS.findIndex((e) => e.id === a) - HOOK_EVENTS.findIndex((e) => e.id === b),
  )

  return (
    <div className="flex flex-col gap-4">
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
          <TextArea value={jsonDraft} onChange={setJsonDraft} rows={24} mono aria-label="Hooks JSON" />
          {jsonError ? <p className="text-xs text-danger">{jsonError}</p> : null}
          <p className="text-xs text-text-faint">
            Switch back to Visual to apply — the JSON must parse first.
          </p>
        </>
      ) : (
        <>
          {events.length === 0 ? (
            <p className="px-1 py-10 text-center text-sm text-text-faint">
              No hooks in this scope yet — add one below.
            </p>
          ) : (
            events.map((event) => {
              const info = hookEventInfo(event)
              return (
                <section key={event} className="flex flex-col gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-text">{event}</h3>
                    <p className="text-xs text-text-faint">{info.description}</p>
                  </div>
                  {(hooks[event] ?? []).map((raw, index) => (
                    <HookGroupCard
                      key={index}
                      event={info}
                      group={raw as Group}
                      onChange={(next) => updateGroup(event, index, next)}
                      onRemove={() => removeGroup(event, index)}
                    />
                  ))}
                </section>
              )
            })
          )}

          <div className="border-t border-line pt-3">
            <HookEventPicker onPick={addGroup} />
          </div>
        </>
      )}
    </div>
  )
}
