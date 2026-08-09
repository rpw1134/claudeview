import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { TextInput } from './editorParts'
import { HookJsonHandlerField } from './HookJsonHandlerField'
import type { HookEventInfo } from './hookEvents'

export type Handler = { type?: string; command?: string; url?: string; timeout?: number; if?: string; [key: string]: unknown }

const TYPE_OPTIONS = [
  { value: 'command', label: 'Command' },
  { value: 'http', label: 'HTTP' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'agent', label: 'Agent' },
]

/** Fresh minimal shape for a handler switching to `type`, keeping `if` if it had one. */
function reshapeForType(type: string, handler: Handler): Handler {
  const kept = handler.if !== undefined ? { if: handler.if } : {}
  if (type === 'command') return { type, command: '', ...kept }
  if (type === 'http') return { type, url: '', ...kept }
  return { type, ...kept }
}

/**
 * One handler within a matcher group's `hooks` array. `command` and `http`
 * get real fields; anything else (`prompt`, `agent`, a future type) falls
 * back to inline JSON — spreading the original object and overriding only
 * the edited keys, per the store's contract, so a field this form doesn't
 * model still survives a save.
 */
export function HookHandlerFields({
  handler,
  event,
  index,
  onChange,
  onRemove,
}: {
  handler: Handler
  event: HookEventInfo
  index: number
  onChange: (next: Handler) => void
  onRemove: () => void
}) {
  const type = handler.type ?? 'command'
  const known = type === 'command' || type === 'http'

  return (
    <div className="flex items-start gap-2 hand-sm-1 bg-surface p-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="w-36">
          <Select
            aria-label={`Handler ${index + 1} type`}
            value={type}
            onChange={(next) => onChange(reshapeForType(next, handler))}
            options={TYPE_OPTIONS}
            className="h-7 text-xs"
          />
        </div>

        {type === 'command' ? (
          <Field label="Command">
            <TextInput
              mono
              value={handler.command ?? ''}
              onChange={(command) => onChange({ ...handler, command })}
              aria-label={`Handler ${index + 1} command`}
            />
          </Field>
        ) : null}

        {type === 'http' ? (
          <Field label="URL">
            <TextInput
              mono
              value={handler.url ?? ''}
              onChange={(url) => onChange({ ...handler, url })}
              placeholder="https://…"
              aria-label={`Handler ${index + 1} URL`}
            />
          </Field>
        ) : null}

        {known ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timeout (s)" hint="Empty means the default.">
              <TextInput
                value={handler.timeout !== undefined ? String(handler.timeout) : ''}
                onChange={(next) =>
                  onChange({ ...handler, timeout: next.trim() === '' ? undefined : Number(next) })
                }
                aria-label={`Handler ${index + 1} timeout`}
              />
            </Field>
            {event.supportsIf ? (
              <Field label="If" hint="Condition expression — runs only when true.">
                <TextInput
                  mono
                  value={handler.if ?? ''}
                  onChange={(next) => onChange({ ...handler, if: next })}
                  aria-label={`Handler ${index + 1} condition`}
                />
              </Field>
            ) : null}
          </div>
        ) : (
          <HookJsonHandlerField
            key={type}
            value={handler}
            onChange={onChange}
            label={`Handler ${index + 1} (${type})`}
          />
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Remove handler ${index + 1}`}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  )
}
