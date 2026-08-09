import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { isValidResourceName } from './resourceCache'

/** A skill only needs a name up front — the body is what SKILL.md is for. */
export function SkillCreateDialog({
  projectPath,
  onCreated,
  onOpenChange,
}: {
  projectPath: string
  onCreated: (name: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!isValidResourceName(trimmed)) {
      setError('Names are lowercase letters, digits, and hyphens.')
      return
    }
    const result = await api['config:skills:create']({ projectPath, name: trimmed })
    if (!result.ok) {
      setError(result.error ?? 'Could not create it.')
      return
    }
    onCreated(trimmed)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title="New skill" description="Named lowercase-hyphen, like a slug.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="pdf-tables"
              aria-label="Skill name"
              className="h-9 w-full hand-sm-2 border border-line-strong bg-raised px-3 font-mono text-sm text-text placeholder:text-text-faint"
            />
          </Field>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <Button type="submit" variant="primary" size="md" className="self-end">
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
