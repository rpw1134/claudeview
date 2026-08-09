import { useEffect, useMemo, useState } from 'react'
import { load as yamlLoad } from 'js-yaml'
import { Trash2, FileCode2 } from 'lucide-react'
import { parseAgentFrontmatter, serializeFrontmatter, type AgentFrontmatter } from '@shared/frontmatter'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { EditorHeader, TextArea, useSaveState } from './editorParts'
import { AgentFormFields, type AgentFormState } from './AgentFormFields'

/**
 * Edit one agent file: the frontmatter fields Claude Code reads, as a form, and
 * the body as the system prompt — or, toggled to raw, the whole file as text.
 *
 * The form covers the fields worth a control; everything else in the
 * frontmatter is preserved verbatim on save, because `serializeFrontmatter`
 * writes back the parsed object with only these keys replaced. A hand-added
 * field never disappears just because this form doesn't know it.
 */

const fromFrontmatter = (frontmatter: AgentFrontmatter, body: string): AgentFormState => ({
  description: frontmatter.description ?? '',
  model: frontmatter.model ?? '',
  permissionMode: frontmatter.permissionMode ?? '',
  tools: (frontmatter.tools ?? []).join(', '),
  disallowedTools: (frontmatter.disallowedTools ?? []).join(', '),
  color: frontmatter.color ?? '',
  effort: frontmatter.effort ?? '',
  memory: frontmatter.memory ?? '',
  background: frontmatter.background === true,
  isolation: frontmatter.isolation === 'worktree',
  maxTurns: frontmatter.maxTurns !== undefined ? String(frontmatter.maxTurns) : '',
  body,
})

const toContent = (name: string, existing: AgentFrontmatter, form: AgentFormState): string =>
  serializeFrontmatter(
    {
      ...existing,
      name: existing.name ?? name,
      description: form.description,
      model: form.model,
      permissionMode: form.permissionMode,
      tools: form.tools.split(',').map((tool) => tool.trim()).filter(Boolean),
      disallowedTools: form.disallowedTools.split(',').map((tool) => tool.trim()).filter(Boolean),
      color: form.color,
      effort: form.effort,
      memory: form.memory,
      background: form.background ? true : undefined,
      isolation: form.isolation ? 'worktree' : '',
      maxTurns: form.maxTurns.trim() === '' ? undefined : Number(form.maxTurns),
    },
    form.body,
  )

/** For the inline warning only — `parseAgentFrontmatter` itself fails soft. */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
function frontmatterParseError(text: string): string | null {
  const match = FRONTMATTER_BLOCK.exec(text)
  if (!match) return null
  try {
    yamlLoad(match[1]!)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid YAML frontmatter'
  }
}

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
  const [form, setForm] = useState<AgentFormState | null>(null)
  const [raw, setRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const save = useSaveState()

  useEffect(() => {
    api['config:agents:get']({ projectPath, name })
      .then((content) => {
        const text = content ?? ''
        setLoaded(text)
        const { frontmatter, body } = parseAgentFrontmatter(text)
        setForm(fromFrontmatter(frontmatter, body))
      })
      .catch(() => setLoaded(''))
  }, [projectPath, name])

  const existingFrontmatter = useMemo(
    () => (loaded === null ? {} : parseAgentFrontmatter(loaded).frontmatter),
    [loaded],
  )

  const serialized = useMemo(() => {
    if (loaded === null || form === null) return null
    return toContent(name, existingFrontmatter, form)
  }, [loaded, name, existingFrontmatter, form])

  if (loaded === null || form === null || serialized === null) return null

  const current = raw ? rawText : serialized
  const dirty = current !== loaded

  const enterRaw = () => {
    setRawText(serialized)
    setRaw(true)
  }

  const leaveRaw = () => {
    const { frontmatter, body } = parseAgentFrontmatter(rawText)
    setForm(fromFrontmatter(frontmatter, body))
    setRaw(false)
  }

  const persist = () =>
    save.run(async () => {
      await api['config:agents:set']({ projectPath, name, content: current })
      setLoaded(current)
      if (raw) {
        const { frontmatter, body } = parseAgentFrontmatter(current)
        setForm(fromFrontmatter(frontmatter, body))
      }
    })

  const remove = async () => {
    await api['config:agents:delete']({ projectPath, name })
    onBack()
  }

  const rawError = raw ? frontmatterParseError(rawText) : null

  return (
    <div className="flex flex-col gap-4">
      <EditorHeader onBack={onBack} title={name} dirty={dirty} saveState={save.state}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (raw ? leaveRaw() : enterRaw())}
          aria-label={raw ? 'Switch to form view' : 'Switch to raw markdown view'}
          aria-pressed={raw}
        >
          <FileCode2 size={13} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void remove()} aria-label="Delete agent">
          <Trash2 size={13} />
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void persist()}>
          Save
        </Button>
      </EditorHeader>

      {raw ? (
        <div className="flex flex-col gap-2">
          <TextArea value={rawText} onChange={setRawText} rows={26} mono aria-label="Agent file contents" />
          {rawError ? (
            <p className="text-xs text-danger">
              Frontmatter didn't parse ({rawError}) — switching back to form view will treat the
              whole file as the prompt until this is fixed.
            </p>
          ) : null}
        </div>
      ) : (
        <AgentFormFields
          state={form}
          set={(key, value) => setForm((current) => (current ? { ...current, [key]: value } : current))}
        />
      )}
    </div>
  )
}
