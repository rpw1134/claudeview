import { ChevronRight } from 'lucide-react'
import type { ReviewFile } from '@shared/ipc'
import { cn, timeAgo } from '@/lib/utils'
import type { TreeDir } from './fileTree'

/**
 * The recursive half of the tree: a directory's children, then its files.
 *
 * Rows have no borders and no card — indentation plus a fill on hover is the whole
 * treatment (Gestalt: proximity does the grouping a box would). The active file is
 * the one exception, and it takes the accent wash rather than a border, so the rail
 * has exactly one coloured thing in it at a time.
 */
export function DirChildren({
  dir,
  depth,
  activePath,
  isCollapsed,
  unresolvedFor,
  isUnviewed,
  onToggle,
  onSelect,
}: {
  dir: TreeDir
  depth: number
  activePath: string | null
  /** Root-qualified by the caller, so two roots can't share collapsed state. */
  isCollapsed: (path: string) => boolean
  unresolvedFor: (path: string) => number
  /** Changed since last opened here — drives the solid-vs-faint dot. */
  isUnviewed: (file: ReviewFile) => boolean
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}) {
  return (
    <>
      {dir.dirs.map((child) => {
        const hidden = isCollapsed(child.path)
        return (
          <div key={child.path}>
            <button
              type="button"
              onClick={() => onToggle(child.path)}
              aria-expanded={!hidden}
              style={{ paddingLeft: 8 + depth * 12 }}
              className="flex w-full items-center gap-1 py-1 pr-2 text-left text-xs
                         text-text-muted transition-colors hover:bg-surface"
            >
              <ChevronRight
                size={12}
                className={cn(
                  'shrink-0 text-text-faint transition-transform duration-150',
                  !hidden && 'rotate-90',
                )}
                aria-hidden
              />
              <span className="truncate">{child.name}</span>
            </button>

            {hidden ? null : (
              <DirChildren
                dir={child}
                depth={depth + 1}
                activePath={activePath}
                isCollapsed={isCollapsed}
                unresolvedFor={unresolvedFor}
                isUnviewed={isUnviewed}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </div>
        )
      })}

      {dir.files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          depth={depth}
          active={file.path === activePath}
          unresolved={unresolvedFor(file.path)}
          unviewed={isUnviewed(file)}
          onSelect={() => onSelect(file.path)}
        />
      ))}
    </>
  )
}

function FileRow({
  file,
  depth,
  active,
  unresolved,
  unviewed,
  onSelect,
}: {
  file: ReviewFile
  depth: number
  active: boolean
  unresolved: number
  unviewed: boolean
  onSelect: () => void
}) {
  const name = file.relPath.slice(file.relPath.lastIndexOf('/') + 1)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      title={file.path}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={cn(
        'flex w-full items-center gap-2 py-1 pr-2 text-left transition-colors',
        active ? 'bg-accent-wash' : 'hover:bg-surface',
      )}
    >
      {/* The dot answers "have I read this since it last changed": solid accent
          until opened, then faint — the same read/unread convention as an inbox.
          Colour is never the only carrier: an unviewed name also sits at full
          text weight below. Deletion overrides in danger, paired with the
          pane's "This file was deleted." */}
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          file.deleted ? 'bg-danger' : unviewed ? 'bg-accent' : 'bg-line-strong',
        )}
        aria-hidden
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          file.deleted
            ? 'text-danger line-through'
            : active || unviewed
              ? 'text-text'
              : 'text-text-muted',
        )}
      >
        {name}
      </span>

      {unresolved > 0 ? (
        <span
          className="shrink-0 rounded-sm bg-accent-wash px-1 text-xs tabular-nums text-text"
          title={`${unresolved} unresolved comment${unresolved === 1 ? '' : 's'}`}
        >
          {unresolved}
        </span>
      ) : null}

      <span className="shrink-0 text-xs tabular-nums text-text-faint">
        {timeAgo(file.lastChangedAt)}
      </span>
    </button>
  )
}
