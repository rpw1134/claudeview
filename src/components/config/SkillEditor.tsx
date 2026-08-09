import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePlus2, Trash2, X } from 'lucide-react'
import type { SkillFiles } from '@shared/ipc'
import { parseSkillFrontmatter, serializeFrontmatter, type SkillFrontmatter } from '@shared/frontmatter'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { EditorHeader, TextArea, useSaveState } from './editorParts'
import { SkillFrontmatterFields, type SkillFormState } from './SkillFrontmatterFields'

const fromFrontmatter = (name: string, frontmatter: SkillFrontmatter, body: string): SkillFormState => ({
  name,
  description: frontmatter.description ?? '',
  argumentHint: frontmatter['argument-hint'] ?? '',
  userInvocable: frontmatter['user-invocable'] !== false,
  disableModelInvocation: frontmatter['disable-model-invocation'] === true,
  body,
})

const toContent = (existing: SkillFrontmatter, form: SkillFormState): string =>
  serializeFrontmatter(
    {
      ...existing,
      name: form.name,
      description: form.description,
      'argument-hint': form.argumentHint,
      'user-invocable': form.userInvocable ? undefined : false,
      'disable-model-invocation': form.disableModelInvocation ? true : undefined,
    },
    form.body,
  )

/**
 * Edit one skill: SKILL.md (frontmatter form + body), its markdown
 * companions, and its `scripts/` files.
 *
 * Everything but SKILL.md is edited as plain text — a companion file is
 * whatever the skill author wants it to be, so a form would have to guess at
 * structure that doesn't exist. SKILL.md gets the frontmatter fields Claude
 * Code actually reads, above the body, because those fields decide whether
 * and how the skill is ever loaded.
 */
export function SkillEditor({
  projectPath,
  name,
  onBack,
}: {
  projectPath: string
  name: string
  onBack: () => void
}) {
  const [files, setFiles] = useState<SkillFiles | null>(null)
  const [active, setActive] = useState('SKILL.md')
  const [loaded, setLoaded] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [skillForm, setSkillForm] = useState<SkillFormState | null>(null)
  const [adding, setAdding] = useState<null | 'file' | 'script'>(null)
  const [newFile, setNewFile] = useState('')
  const save = useSaveState()

  const isSkillMd = active === 'SKILL.md'

  const refreshFiles = useCallback(() => {
    api['config:skills:files']({ projectPath, name }).then(setFiles).catch(() => undefined)
  }, [projectPath, name])

  useEffect(refreshFiles, [refreshFiles])

  useEffect(() => {
    setLoaded(null)
    setSkillForm(null)
    api['config:skills:read']({ projectPath, name, file: active })
      .then((text) => {
        const found = text ?? ''
        setLoaded(found)
        if (active === 'SKILL.md') {
          const { frontmatter, body } = parseSkillFrontmatter(found)
          setSkillForm(fromFrontmatter(name, frontmatter, body))
        } else {
          setContent(found)
        }
      })
      .catch(() => setLoaded(''))
  }, [projectPath, name, active])

  const existingFrontmatter = useMemo(
    () => (loaded === null || !isSkillMd ? {} : parseSkillFrontmatter(loaded).frontmatter),
    [loaded, isSkillMd],
  )

  const current = isSkillMd
    ? skillForm === null
      ? null
      : toContent(existingFrontmatter, skillForm)
    : content

  if (loaded === null || current === null) return null
  const dirty = current !== loaded

  const persist = () =>
    save.run(async () => {
      await api['config:skills:write']({ projectPath, name, file: active, content: current })
      setLoaded(current)
    })

  const removeSkill = async () => {
    if (!window.confirm(`Delete the "${name}" skill? This removes its whole directory.`)) return
    await api['config:skills:delete']({ projectPath, name })
    onBack()
  }

  const removeFile = async (file: string) => {
    if (!window.confirm(`Delete ${file}?`)) return
    await api['config:skills:delete-file']({ projectPath, name, file })
    if (file === active) setActive('SKILL.md')
    refreshFiles()
  }

  const addFile = async () => {
    const trimmed = newFile.trim()
    if (!trimmed || !adding) return
    const file = adding === 'script' ? `scripts/${trimmed}` : trimmed
    await api['config:skills:write']({ projectPath, name, file, content: '' })
    setAdding(null)
    setNewFile('')
    refreshFiles()
    setActive(file)
  }

  if (files === null) return null
  const allFiles = [...files.files, ...files.scripts]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <EditorHeader onBack={onBack} title={name} dirty={dirty} saveState={save.state}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void removeSkill()}
          aria-label="Delete skill"
        >
          <Trash2 size={13} />
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void persist()}>
          Save
        </Button>
      </EditorHeader>

      {/* The file strip. SKILL.md always leads; scripts keep their prefix so the
          two kinds read differently at a glance. The delete × sits visibly on the
          active chip rather than only appearing on hover, which was easy to miss. */}
      <div className="flex flex-wrap items-center gap-1">
        {allFiles.map((file) => (
          <span key={file} className="group relative inline-flex">
            <button
              type="button"
              onClick={() => setActive(file)}
              aria-current={file === active ? 'true' : undefined}
              className={cn(
                'hand-sm-1 py-1 pl-2 font-mono text-xs transition-colors',
                file !== 'SKILL.md' ? 'pr-6' : 'pr-2',
                file === active
                  ? 'bg-accent-wash text-text'
                  : 'text-text-muted hover:bg-raised hover:text-text',
              )}
            >
              {file}
            </button>
            {file !== 'SKILL.md' ? (
              <button
                type="button"
                onClick={() => void removeFile(file)}
                aria-label={`Delete ${file}`}
                className={cn(
                  'absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center',
                  'rounded-full text-text-faint transition-colors hover:bg-overlay hover:text-danger',
                  file === active ? 'flex' : 'hidden group-hover:flex',
                )}
              >
                <X size={11} />
              </button>
            ) : null}
          </span>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding((value) => (value === 'file' ? null : 'file'))}
        >
          <FilePlus2 size={12} /> file
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding((value) => (value === 'script' ? null : 'script'))}
        >
          <FilePlus2 size={12} /> script
        </Button>
      </div>

      {adding ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void addFile()
          }}
        >
          {adding === 'script' ? (
            <span className="font-mono text-xs text-text-faint">scripts/</span>
          ) : null}
          <input
            autoFocus
            value={newFile}
            onChange={(event) => setNewFile(event.target.value)}
            placeholder={adding === 'script' ? 'run.sh' : 'reference.md'}
            aria-label="New file name"
            className="h-8 min-w-0 flex-1 hand-sm-2 border border-line-strong bg-raised px-3 font-mono text-sm text-text placeholder:text-text-faint"
          />
          <Button type="submit" variant="primary" size="md">
            Add
          </Button>
        </form>
      ) : null}

      {isSkillMd && skillForm ? (
        <SkillFrontmatterFields
          state={skillForm}
          set={(key, value) => setSkillForm((cur) => (cur ? { ...cur, [key]: value } : cur))}
        />
      ) : null}

      <div className="min-h-0 flex-1">
        {isSkillMd && skillForm ? (
          <TextArea
            value={skillForm.body}
            onChange={(body) => setSkillForm((cur) => (cur ? { ...cur, body } : cur))}
            rows={16}
            mono
            aria-label="SKILL.md body"
          />
        ) : (
          <TextArea value={content} onChange={setContent} rows={20} mono aria-label={active} />
        )}
      </div>
    </div>
  )
}
