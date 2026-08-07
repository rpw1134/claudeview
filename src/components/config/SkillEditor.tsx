import { useCallback, useEffect, useState } from 'react'
import { FilePlus2, Trash2 } from 'lucide-react'
import type { SkillFiles } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { EditorHeader, TextArea, useSaveState } from './editorParts'

/**
 * Edit one skill: SKILL.md, its markdown companions, and its `scripts/` files.
 *
 * Everything is edited as plain text. SKILL.md's frontmatter could get the same
 * form treatment as agents, but a skill is fundamentally a *document* the model
 * reads — the body dominates, and a form would bury it under fields most skills
 * never set. The file strip keeps every file one click away instead.
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
  const [adding, setAdding] = useState<null | 'file' | 'script'>(null)
  const [newFile, setNewFile] = useState('')
  const save = useSaveState()

  const refreshFiles = useCallback(() => {
    api['config:skills:files']({ projectPath, name }).then(setFiles).catch(() => undefined)
  }, [projectPath, name])

  useEffect(refreshFiles, [refreshFiles])

  useEffect(() => {
    setLoaded(null)
    api['config:skills:read']({ projectPath, name, file: active })
      .then((text) => {
        setLoaded(text ?? '')
        setContent(text ?? '')
      })
      .catch(() => {
        setLoaded('')
        setContent('')
      })
  }, [projectPath, name, active])

  const dirty = loaded !== null && content !== loaded

  const persist = () =>
    save.run(async () => {
      await api['config:skills:write']({ projectPath, name, file: active, content })
      setLoaded(content)
    })

  const removeSkill = async () => {
    await api['config:skills:delete']({ projectPath, name })
    onBack()
  }

  const removeFile = async (file: string) => {
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
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
          two kinds read differently at a glance. */}
      <div className="flex flex-wrap items-center gap-1">
        {allFiles.map((file) => (
          <span key={file} className="group relative inline-flex">
            <button
              type="button"
              onClick={() => setActive(file)}
              aria-current={file === active ? 'true' : undefined}
              className={cn(
                'hand-sm-1 px-2 py-1 font-mono text-xs transition-colors',
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
                className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-raised text-[9px] leading-none text-text-muted hover:text-danger group-hover:flex"
              >
                ×
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

      {loaded === null ? null : (
        <div className="min-h-0 flex-1">
          <TextArea value={content} onChange={setContent} rows={20} mono aria-label={active} />
        </div>
      )}
    </div>
  )
}
