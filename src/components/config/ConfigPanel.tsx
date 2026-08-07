import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import type { ConfigProject } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import { AgentEditor } from './AgentEditor'
import { SkillEditor } from './SkillEditor'
import { HooksEditor } from './HooksEditor'

/**
 * The Claude Code configuration view: agents, skills, and hooks for a chosen
 * scope (global `~/.claude`, or any project the CLI knows about).
 *
 * This fills the window as its own surface — deliberately separate from the
 * session/terminal workspace, which keeps running (hidden, still mounted)
 * while you're here. Opt+K or the toolbar button switches either way.
 * Navigation is list -> editor with a back affordance, which also holds up if
 * this ever gets embedded somewhere narrower.
 */

type Section = 'agents' | 'skills' | 'hooks'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'hooks', label: 'Hooks' },
]

export function ConfigPanel() {
  const [projects, setProjects] = useState<ConfigProject[]>([])
  const [scope, setScope] = useState<string>('')
  const [section, setSection] = useState<Section>('agents')
  /** Name of the agent/skill being edited; null shows the list. */
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    api['config:projects:list']()
      .then((found) => {
        setProjects(found)
        setScope((current) => current || (found[0]?.path ?? ''))
      })
      .catch(() => setProjects([]))
  }, [])

  const switchSection = (next: Section) => {
    setSection(next)
    setOpen(null)
  }

  if (!scope) return null

  return (
    // Full-window surface, so the content sits in a centered column: config is
    // forms and prose, and edge-to-edge fields on a wide window read as a sheet
    // of inputs rather than a page.
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <nav className="flex items-center gap-0.5" aria-label="Config sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => switchSection(entry.id)}
              aria-current={section === entry.id ? 'true' : undefined}
              className={cn(
                'hand-sm-1 px-2.5 py-1 text-sm transition-colors',
                section === entry.id
                  ? 'bg-accent-wash text-text'
                  : 'text-text-muted hover:bg-raised hover:text-text',
              )}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto w-40 min-w-0">
          <Select
            aria-label="Config scope"
            value={scope}
            onChange={(next) => {
              setScope(next)
              setOpen(null)
            }}
            options={projects.map((project) => ({ value: project.path, label: project.name }))}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl">
        {section === 'hooks' ? (
          <HooksEditor projectPath={scope} />
        ) : open !== null ? (
          section === 'agents' ? (
            <AgentEditor projectPath={scope} name={open} onBack={() => setOpen(null)} />
          ) : (
            <SkillEditor projectPath={scope} name={open} onBack={() => setOpen(null)} />
          )
        ) : (
          <ResourceList key={`${scope}:${section}`} projectPath={scope} kind={section} onOpen={setOpen} />
        )}
        </div>
      </div>
    </div>
  )
}

/**
 * The agents or skills list for a scope, with inline create.
 *
 * Keyed by scope+section from the parent, so switching either one remounts and
 * refetches instead of flashing the previous scope's rows.
 */
function ResourceList({
  projectPath,
  kind,
  onOpen,
}: {
  projectPath: string
  kind: 'agents' | 'skills'
  onOpen: (name: string) => void
}) {
  const [names, setNames] = useState<string[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const list = kind === 'agents' ? api['config:agents:list'] : api['config:skills:list']
    list({ projectPath })
      .then(setNames)
      .catch(() => setNames([]))
  }, [projectPath, kind])

  useEffect(refresh, [refresh])

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    if (!/^[a-z0-9-]+$/.test(name)) {
      setError('Names are lowercase letters, digits, and hyphens.')
      return
    }
    const result =
      kind === 'agents'
        ? await api['config:agents:create']({
            projectPath,
            name,
            content: `---\nname: ${name}\ndescription: \n---\n\n`,
          })
        : await api['config:skills:create']({ projectPath, name })
    if (!result.ok) {
      setError(result.error ?? 'Could not create it.')
      return
    }
    setCreating(false)
    setNewName('')
    setError(null)
    onOpen(name)
  }

  if (names === null) return null

  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="mb-1 flex items-center gap-1">
        <span className="text-xs text-text-faint">
          {names.length} {kind === 'agents' ? 'agent' : 'skill'}
          {names.length === 1 ? '' : 's'}
        </span>
        <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh list">
          <RefreshCw size={12} />
        </Button>
        <Button
          variant="subtle"
          size="sm"
          className="ml-auto"
          onClick={() => setCreating((value) => !value)}
        >
          <Plus size={12} /> New
        </Button>
      </div>

      {creating ? (
        <form
          className="mb-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={kind === 'agents' ? 'agent-name' : 'skill-name'}
            aria-label="New name"
            className="h-8 min-w-0 flex-1 hand-sm-2 border border-line-strong bg-raised px-3 font-mono text-sm text-text placeholder:text-text-faint"
          />
          <Button type="submit" variant="primary" size="md">
            Create
          </Button>
        </form>
      ) : null}
      {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}

      {names.length === 0 && !creating ? (
        <p className="px-1 py-6 text-center text-sm text-text-faint">
          Nothing here yet — create the first one.
        </p>
      ) : (
        names.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onOpen(name)}
            className="hand-sm-1 px-3 py-2 text-left font-mono text-sm text-text transition-colors hover:bg-raised"
          >
            {name}
          </button>
        ))
      )}
    </div>
  )
}
