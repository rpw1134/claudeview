import { useEffect, useState } from 'react'
import type { ConfigProject } from '@shared/ipc'
import { api } from '@/lib/api'
import { ConfigSidebar, type Section } from './ConfigSidebar'
import { ResourceList } from './ResourceList'
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
 * Layout is a left rail (sections + scope) beside a content column with its
 * own page header, which holds up down to narrow window widths without the
 * cramped single header row the v1 had.
 */

const SECTION_COPY: Record<Section, { title: string; hint: string }> = {
  agents: { title: 'Agents', hint: 'Specialists Claude can delegate a task to.' },
  skills: { title: 'Skills', hint: 'Reference material and scripts Claude can load on demand.' },
  hooks: { title: 'Hooks', hint: 'Shell commands and requests Claude Code runs on lifecycle events.' },
}

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

  const switchScope = (next: string) => {
    setScope(next)
    setOpen(null)
  }

  if (!scope) return null

  const copy = SECTION_COPY[section]
  const scopeName = projects.find((project) => project.path === scope)?.name ?? ''

  return (
    <div className="flex h-full min-h-0">
      <ConfigSidebar
        section={section}
        onSection={switchSection}
        scope={scope}
        onScope={switchScope}
        projects={projects}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {section === 'hooks' ? (
          <div className="flex flex-col">
            <PageHeader title={copy.title} hint={copy.hint} scopeName={scopeName} />
            <div className="px-6 pb-10">
              <HooksEditor projectPath={scope} />
            </div>
          </div>
        ) : open !== null ? (
          section === 'agents' ? (
            <div className="px-6 py-6">
              <AgentEditor projectPath={scope} name={open} onBack={() => setOpen(null)} />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col px-6 py-6">
              <SkillEditor projectPath={scope} name={open} onBack={() => setOpen(null)} />
            </div>
          )
        ) : (
          <div className="flex flex-col">
            <PageHeader title={copy.title} hint={copy.hint} scopeName={scopeName} />
            <ResourceList
              key={`${scope}:${section}`}
              projectPath={scope}
              kind={section}
              onOpen={setOpen}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Per-section page header. Not the app's handwritten display face — that's
 * on a two-string budget for the whole app (see docs/design-system.md) and
 * is already spent on the wordmark and the landing screen. Weight and size
 * carry the hierarchy here instead.
 */
function PageHeader({ title, hint, scopeName }: { title: string; hint: string; scopeName: string }) {
  return (
    <div className="flex flex-col gap-1 px-6 pb-5 pt-6">
      <h1 className="text-lg font-semibold text-text">{title}</h1>
      <p className="text-sm text-text-muted">
        {hint}
        {scopeName ? <span className="text-text-faint"> · {scopeName} scope</span> : null}
      </p>
    </div>
  )
}
