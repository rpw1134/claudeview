import { useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { parseAgentFrontmatter, parseSkillFrontmatter } from '@shared/frontmatter'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { AgentCreateDialog } from './AgentCreateDialog'
import { SkillCreateDialog } from './SkillCreateDialog'
import { ResourceListRow } from './ResourceListRow'
import { getCachedMeta, metaKey, setCachedMeta, type ResourceMeta } from './resourceCache'

/**
 * The agents or skills list for a scope.
 *
 * Names render immediately from the list call; each row's description (and
 * an agent's model) is fetched lazily in the background and cached, so a
 * scope with many entries doesn't block the list on one file read per row.
 */
export function ResourceList({
  projectPath,
  kind,
  onOpen,
}: {
  projectPath: string
  kind: 'agents' | 'skills'
  onOpen: (name: string) => void
}) {
  const [names, setNames] = useState<string[] | null>(null)
  const [meta, setMeta] = useState<Record<string, ResourceMeta>>({})
  const [creating, setCreating] = useState(false)

  const refresh = () => {
    const list = kind === 'agents' ? api['config:agents:list'] : api['config:skills:list']
    list({ projectPath })
      .then(setNames)
      .catch(() => setNames([]))
  }

  useEffect(refresh, [projectPath, kind])

  useEffect(() => {
    if (!names) return
    setMeta({})
    names.forEach((name) => {
      const key = metaKey(kind, projectPath, name)
      const cached = getCachedMeta(key)
      if (cached) {
        setMeta((current) => ({ ...current, [name]: cached }))
        return
      }
      const load =
        kind === 'agents'
          ? api['config:agents:get']({ projectPath, name }).then((content) => {
              const { frontmatter } = parseAgentFrontmatter(content ?? '')
              return { description: frontmatter.description ?? '', model: frontmatter.model }
            })
          : api['config:skills:read']({ projectPath, name, file: 'SKILL.md' }).then((content) => {
              const { frontmatter } = parseSkillFrontmatter(content ?? '')
              return { description: frontmatter.description ?? '' }
            })
      load
        .then((found) => {
          setCachedMeta(key, found)
          setMeta((current) => ({ ...current, [name]: found }))
        })
        .catch(() => undefined)
    })
  }, [names, kind, projectPath])

  if (names === null) return null

  return (
    <div className="flex flex-col gap-1 px-6 pb-10">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-text-faint">
          {names.length} {kind === 'agents' ? 'agent' : 'skill'}
          {names.length === 1 ? '' : 's'}
        </span>
        <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh list">
          <RefreshCw size={13} />
        </Button>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus size={13} /> New {kind === 'agents' ? 'agent' : 'skill'}
        </Button>
      </div>

      {names.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-text-faint">
          No {kind} in this scope yet — create the first one.
        </p>
      ) : (
        names.map((name) => (
          <ResourceListRow
            key={name}
            name={name}
            description={meta[name]?.description}
            model={kind === 'agents' ? meta[name]?.model : undefined}
            onOpen={() => onOpen(name)}
          />
        ))
      )}

      {creating && kind === 'agents' ? (
        <AgentCreateDialog
          projectPath={projectPath}
          onCreated={(name) => {
            setCreating(false)
            onOpen(name)
          }}
          onOpenChange={setCreating}
        />
      ) : null}
      {creating && kind === 'skills' ? (
        <SkillCreateDialog
          projectPath={projectPath}
          onCreated={(name) => {
            setCreating(false)
            onOpen(name)
          }}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  )
}
