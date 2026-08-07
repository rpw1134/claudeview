import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { parseAgentFrontmatter, serializeFrontmatter } from '@shared/frontmatter'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { EditorHeader, TextArea, TextInput, useSaveState } from './editorParts'

/**
 * Edit one agent file: the frontmatter fields Claude Code reads, as a form, and
 * the body as the system prompt.
 *
 * The form covers the fields worth a control; everything else in the
 * frontmatter is preserved verbatim on save, because `serializeFrontmatter`
 * writes back the parsed object with only these keys replaced. A hand-added
 * field never disappears just because this form doesn't know it.
 */

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

export function AgentEditor({
  projectPath,
  name,
  onBack,
}: {
  projectPath: string
  name: string
  onBack: () => void
}) {
  const [loaded, setLoaded] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [permissionMode, setPermissionMode] = useState('')
  const [tools, setTools] = useState('')
  const [body, setBody] = useState('')
  const save = useSaveState()

  useEffect(() => {
    api['config:agents:get']({ projectPath, name })
      .then((content) => {
        const text = content ?? ''
        setLoaded(text)
        const { frontmatter, body: parsedBody } = parseAgentFrontmatter(text)
        setDescription(frontmatter.description ?? '')
        setModel(frontmatter.model ?? '')
        setPermissionMode(frontmatter.permissionMode ?? '')
        setTools((frontmatter.tools ?? []).join(', '))
        setBody(parsedBody)
      })
      .catch(() => setLoaded(''))
  }, [projectPath, name])

  const serialized = useMemo(() => {
    if (loaded === null) return null
    const { frontmatter } = parseAgentFrontmatter(loaded)
    return serializeFrontmatter(
      {
        ...frontmatter,
        name: frontmatter.name ?? name,
        description,
        model,
        permissionMode,
        tools: tools
          .split(',')
          .map((tool) => tool.trim())
          .filter(Boolean),
      },
      body,
    )
  }, [loaded, name, description, model, permissionMode, tools, body])

  if (loaded === null || serialized === null) return null
  const dirty = serialized !== loaded

  const persist = () =>
    save.run(async () => {
      await api['config:agents:set']({ projectPath, name, content: serialized })
      setLoaded(serialized)
    })

  const remove = async () => {
    await api['config:agents:delete']({ projectPath, name })
    onBack()
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <EditorHeader onBack={onBack} title={name} dirty={dirty} saveState={save.state}>
        <Button variant="ghost" size="icon" onClick={() => void remove()} aria-label="Delete agent">
          <Trash2 size={13} />
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void persist()}>
          Save
        </Button>
      </EditorHeader>

      <Field label="Description" hint="When should Claude delegate to this agent?">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Model">
          <Select aria-label="Model" value={model} onChange={setModel} options={MODEL_OPTIONS} />
        </Field>
        <Field label="Permission mode">
          <Select
            aria-label="Permission mode"
            value={permissionMode}
            onChange={setPermissionMode}
            options={PERMISSION_OPTIONS}
          />
        </Field>
      </div>

      <Field label="Tools" hint="Comma-separated. Empty means all tools.">
        <TextInput value={tools} onChange={setTools} mono placeholder="Read, Grep, Bash" />
      </Field>

      <Field label="System prompt">
        <TextArea value={body} onChange={setBody} rows={16} mono />
      </Field>
    </div>
  )
}
