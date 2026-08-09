import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { TextInput } from './editorParts'
import { HookHandlerFields, type Handler } from './HookHandlerFields'
import type { HookEventInfo } from './hookEvents'

export type Group = { matcher?: string; hooks?: unknown[]; [key: string]: unknown }

/**
 * One matcher group for an event: an optional tool-name matcher, and one or
 * more handlers that all run for it. Groups support multiple handlers (a
 * command and an http call on the same matcher), so handlers get their own
 * add/remove rather than the group being one handler with extra keys.
 */
export function HookGroupCard({
  event,
  group,
  onChange,
  onRemove,
}: {
  event: HookEventInfo
  group: Group
  onChange: (next: Group) => void
  onRemove: () => void
}) {
  const handlers = Array.isArray(group.hooks) ? (group.hooks as Handler[]) : []

  const updateHandler = (index: number, next: Handler) => {
    onChange({ ...group, hooks: handlers.map((handler, i) => (i === index ? next : handler)) })
  }

  const removeHandler = (index: number) => {
    onChange({ ...group, hooks: handlers.filter((_, i) => i !== index) })
  }

  const addHandler = () => {
    onChange({ ...group, hooks: [...handlers, { type: 'command', command: '' }] })
  }

  return (
    <div className="flex flex-col gap-2 hand-sm-1 border border-line bg-surface p-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {event.supportsMatcher ? (
            <Field label="Matcher" hint="Tool-name pattern, e.g. Bash or Edit|Write. Empty matches all.">
              <TextInput
                mono
                value={typeof group.matcher === 'string' ? group.matcher : ''}
                onChange={(matcher) => onChange({ ...group, matcher })}
                aria-label={`${event.id} matcher`}
              />
            </Field>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${event.id} group`}>
          <Trash2 size={13} />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {handlers.map((handler, index) => (
          <HookHandlerFields
            key={index}
            handler={handler}
            event={event}
            index={index}
            onChange={(next) => updateHandler(index, next)}
            onRemove={() => removeHandler(index)}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" className="self-start" onClick={addHandler}>
        <Plus size={12} /> Add handler
      </Button>
    </div>
  )
}
