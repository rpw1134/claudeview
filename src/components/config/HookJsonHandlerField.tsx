import { useState } from 'react'
import { Field } from '@/components/ui/Field'
import { TextArea } from './editorParts'

/**
 * A handler type this form has no dedicated fields for (`prompt`, `agent`,
 * anything future) — edited as JSON inline rather than kicking the whole
 * group out to the top-level JSON tab, so it stays visible next to its
 * sibling handlers.
 *
 * The text buffer is local: only a successful parse calls `onChange`, so an
 * in-progress edit (a dangling comma mid-type) doesn't wipe out the handler
 * or block typing. `resetKey` should change whenever the caller wants the
 * buffer reseeded from a new value (e.g. switching a handler to this type).
 */
export function HookJsonHandlerField({
  value,
  onChange,
  label,
}: {
  value: unknown
  onChange: (value: Record<string, unknown>) => void
  label: string
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: string) => {
    setText(next)
    try {
      const parsed = JSON.parse(next) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Must be a JSON object')
      }
      onChange(parsed as Record<string, unknown>)
      setError(null)
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Invalid JSON')
    }
  }

  return (
    <Field label={label} hint="This handler type has no dedicated fields — edited as JSON.">
      <TextArea value={text} onChange={handleChange} rows={6} mono aria-label={label} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </Field>
  )
}
