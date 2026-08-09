import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The narrow slice of git the review set needs, behind `execFile`.
 *
 * `execFile` rather than `exec`/`spawn`-with-shell is not a style preference:
 * every argument here derives from a path the model chose, and a shell would make
 * `$(…)` in a filename an execution primitive. There is no shell in this file and
 * none may be introduced.
 *
 * Every call resolves rather than rejects. A cwd that isn't a repo, a repo with
 * no commits, a git that isn't installed — all normal, all reported as "nothing
 * to say" so the caller has no error path to get wrong.
 */

/** Bound on `git show` output. A baseline larger than this is not worth diffing. */
const MAX_BLOB_BYTES = 8 * 1024 * 1024

/** Time a single git invocation is allowed before it's abandoned. */
const GIT_TIMEOUT_MS = 5_000

export type GitChange = {
  /** Repo-relative, as git reports it. */
  relPath: string
  /** git's two-letter status code, e.g. `' M'`, `'??'`, `'D '`. */
  code: string
}

/** True if `dir` is inside a git work tree. */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dir,
      timeout: GIT_TIMEOUT_MS,
    })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Working-tree changes, including untracked files individually (`-uall`).
 *
 * Without `-uall` git collapses an untracked directory to a single `dir/` entry,
 * which is exactly the case where an agent has just scaffolded ten new files and
 * the review set would show one useless folder row.
 */
export async function statusPorcelain(dir: string): Promise<GitChange[]> {
  let stdout: string
  try {
    ;({ stdout } = await run('git', ['status', '--porcelain', '-uall'], {
      cwd: dir,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BLOB_BYTES,
    }))
  } catch {
    return []
  }

  const changes: GitChange[] = []
  for (const line of stdout.split('\n')) {
    if (line.length < 4) continue
    const code = line.slice(0, 2)
    let relPath = line.slice(3)

    // Renames report `old -> new`; only the destination exists on disk.
    const arrow = relPath.indexOf(' -> ')
    if (arrow !== -1) relPath = relPath.slice(arrow + 4)

    // Paths with unusual bytes come back quoted and C-escaped. Unescaping them
    // correctly is more surface than it's worth here, so they're skipped —
    // the tool-event path still catches anything an agent edits.
    if (relPath.startsWith('"')) continue

    changes.push({ code, relPath })
  }
  return changes
}

/** File contents at HEAD, or null if the path isn't in HEAD (or there is no HEAD). */
export async function showHead(dir: string, relPath: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['show', `HEAD:${relPath}`], {
      cwd: dir,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BLOB_BYTES,
    })
    return stdout
  } catch {
    return null
  }
}
