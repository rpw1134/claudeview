import type { ReviewFile } from '@shared/ipc'

/**
 * The review set, arranged for reading.
 *
 * The set arrives as a flat list sorted most-recently-changed first, which is the
 * right order for "what just happened" and the wrong shape for "where does this
 * live" — twenty entries all beginning `src/components/` differ only in their last
 * segment, and the eye has to read every path to the end. Nesting turns that into
 * one directory row and twenty short names.
 *
 * Two properties are preserved deliberately:
 *
 *  - **Recency order survives.** Directories appear in the order their first file
 *    did, and files keep the order they arrived in. The most recently touched file
 *    is still the first thing under the first heading.
 *  - **Chains collapse.** A directory whose only child is another directory merges
 *    with it (`src/components/review`), because in a 260px rail three rows of
 *    indentation to reach one file is the tree costing more than it saves.
 */

export type TreeDir = {
  /** Display name — may span several segments where a chain was collapsed. */
  name: string
  /** Root-relative directory path. Stable, so it can key collapsed state. */
  path: string
  dirs: TreeDir[]
  files: ReviewFile[]
}

export type RootGroup = {
  root: string
  tree: TreeDir
}

function emptyDir(name: string, path: string): TreeDir {
  return { name, path, dirs: [], files: [] }
}

/** Merge a directory that holds exactly one directory and nothing else. */
function collapse(dir: TreeDir): TreeDir {
  const dirs = dir.dirs.map(collapse)
  const only = dirs[0]
  if (dir.files.length === 0 && dirs.length === 1 && only) {
    return { name: `${dir.name}/${only.name}`, path: only.path, dirs: only.dirs, files: only.files }
  }
  return { ...dir, dirs }
}

export function buildTree(files: ReviewFile[]): RootGroup[] {
  const groups = new Map<string, TreeDir>()

  for (const file of files) {
    let dir = groups.get(file.root)
    if (!dir) {
      dir = emptyDir(file.root, '')
      groups.set(file.root, dir)
    }

    const segments = file.relPath.split('/')
    const basename = segments.pop()
    // A path ending in `/` isn't a file; the tracker never emits one, but the
    // tree must not invent an entry with no name if that ever changes.
    if (!basename) continue

    let cursor = dir
    let path = ''
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment
      let next = cursor.dirs.find((entry) => entry.path === path)
      if (!next) {
        next = emptyDir(segment, path)
        cursor.dirs.push(next)
      }
      cursor = next
    }
    cursor.files.push(file)
  }

  // The root node is never drawn as a row (its group header is), so it is not a
  // collapse candidate itself — only its children are.
  return [...groups].map(([root, tree]) => ({ root, tree: { ...tree, dirs: tree.dirs.map(collapse) } }))
}
