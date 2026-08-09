import { Bot, Sparkles, Webhook } from 'lucide-react'
import type { ConfigProject } from '@shared/ipc'
import { Select } from '@/components/ui/Field'
import { cn } from '@/lib/utils'

export type Section = 'agents' | 'skills' | 'hooks'

const SECTIONS: { id: Section; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'hooks', label: 'Hooks', icon: Webhook },
]

/**
 * Left rail: the three sections plus the scope picker.
 *
 * A single hairline on the right is the one boundary this view draws — the
 * design system's "at most one visible boundary per nesting chain" rule reads
 * this as the region separator between rail and content, same role as the
 * composer/transcript rule elsewhere in the app.
 */
export function ConfigSidebar({
  section,
  onSection,
  scope,
  onScope,
  projects,
}: {
  section: Section
  onSection: (section: Section) => void
  scope: string
  onScope: (scope: string) => void
  projects: ConfigProject[]
}) {
  return (
    <div className="flex w-44 shrink-0 flex-col gap-4 border-r border-line px-3 py-4">
      <nav className="flex flex-col gap-0.5" aria-label="Config sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSection(id)}
            aria-current={section === id ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 hand-sm-1 px-2.5 py-2 text-sm transition-colors',
              section === id
                ? 'bg-accent-wash text-text'
                : 'text-text-muted hover:bg-raised hover:text-text',
            )}
          >
            <Icon size={15} className="shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5">
        <label htmlFor="config-scope" className="px-0.5 text-xs font-medium text-text-muted">
          Scope
        </label>
        <Select
          id="config-scope"
          aria-label="Config scope"
          value={scope}
          onChange={onScope}
          options={projects.map((project) => ({ value: project.path, label: project.name }))}
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}
