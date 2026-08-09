import { Field, Toggle } from '@/components/ui/Field'
import { TextArea, TextInput } from './editorParts'

export type SkillFormState = {
  name: string
  description: string
  argumentHint: string
  userInvocable: boolean
  disableModelInvocation: boolean
  body: string
}

/**
 * SKILL.md's frontmatter, above the document body. Kept lighter than the
 * agent form — a skill is a document the model reads, and the body is what
 * that document is for, so only the fields that change how the skill is
 * discovered/invoked get a control. `name` is read-only: it's the directory
 * name, changed by renaming the skill rather than editing a field.
 */
export function SkillFrontmatterFields({
  state,
  set,
}: {
  state: SkillFormState
  set: <K extends keyof SkillFormState>(key: K, value: SkillFormState[K]) => void
}) {
  return (
    <div className="flex flex-col gap-3 pb-4">
      <Field label="Name" hint="Set by the skill's directory — rename the skill to change it.">
        <p className="h-9 flex items-center hand-sm-2 bg-surface px-3 font-mono text-sm text-text-muted">
          {state.name}
        </p>
      </Field>

      <Field label="Description" hint="What this skill does and when Claude should reach for it.">
        <TextArea value={state.description} onChange={(v) => set('description', v)} rows={2} />
      </Field>

      <Field label="Argument hint" hint="Shown to the user when invoking this skill by hand.">
        <TextInput
          value={state.argumentHint}
          onChange={(v) => set('argumentHint', v)}
          placeholder="<file>"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Toggle
          checked={state.userInvocable}
          onChange={(v) => set('userInvocable', v)}
          label="User-invocable"
        />
        <Toggle
          checked={state.disableModelInvocation}
          onChange={(v) => set('disableModelInvocation', v)}
          label="Disable model invocation"
        />
      </div>
    </div>
  )
}
