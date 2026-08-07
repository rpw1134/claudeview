import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ConfigProject, HooksConfig, SkillFiles } from '../../../shared/ipc'

/**
 * Reads and writes Claude Code configuration on disk: agents, skills, and the
 * `hooks` key of settings.json, in either the global `~/.claude` scope or a
 * project's `<dir>/.claude`.
 *
 * Ported from the Stryde config editor's services (claude-config-editor), which
 * proved the shapes: an agent is one markdown file, a skill is a directory that
 * exists iff it contains a `SKILL.md`, hooks live inside settings.json and every
 * write must preserve the keys this app doesn't manage.
 *
 * ## The scope rule
 *
 * `~/.claude` *is* its own config dir; any other project path gets `/.claude`
 * appended. One helper owns that rule so nothing else re-derives it.
 *
 * ## Paths are validated here, not trusted
 *
 * Every name and relative file path from the renderer passes through
 * `safeName` / `safeRelative` before touching the filesystem. The renderer
 * displays model-authored content, so IPC payloads are treated as hostile:
 * a traversal like `../../.ssh/id_rsa` must die at this boundary.
 */

const home = (): string => os.homedir()

const resolveHome = (input: string): string =>
  input === '~' || input.startsWith('~/') ? path.join(home(), input.slice(1)) : input

/** Reject anything that could escape a directory when used as a single segment. */
function safeName(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid name: ${JSON.stringify(name)}`)
  return name
}

/** Resolve `relative` inside `root`, refusing anything that escapes it. */
function safeRelative(root: string, relative: string): string {
  const resolved = path.resolve(root, relative)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes its directory: ${JSON.stringify(relative)}`)
  }
  return resolved
}

/** The one place the global-vs-project rule lives. */
export function configDir(projectPath: string): string {
  const resolved = path.resolve(resolveHome(projectPath))
  const globalDir = path.join(home(), '.claude')
  return resolved === globalDir ? globalDir : path.join(resolved, '.claude')
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeEnsuringDir(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Scopes worth offering: global first, then every directory registered in
 * `~/.claude.json` that still has a `CLAUDE.md`. The registry accumulates every
 * directory the CLI was ever run in; the CLAUDE.md filter is what separates
 * "a project the user set up" from "a directory once visited".
 */
export async function listProjects(): Promise<ConfigProject[]> {
  const globalDir = path.join(home(), '.claude')
  const projects: ConfigProject[] = [{ path: globalDir, name: 'Global' }]

  const raw = await readIfExists(path.join(home(), '.claude.json'))
  if (!raw) return projects

  let registered: string[] = []
  try {
    const parsed = JSON.parse(raw) as { projects?: Record<string, unknown> }
    registered = Object.keys(parsed.projects ?? {})
  } catch {
    return projects
  }

  const checks = await Promise.all(
    registered.map(async (dir) => {
      if (path.resolve(dir) === globalDir) return null
      const hasClaudeMd = await readIfExists(path.join(dir, 'CLAUDE.md'))
      return hasClaudeMd === null ? null : { path: dir, name: path.basename(dir) }
    }),
  )

  return [
    ...projects,
    ...checks
      .filter((entry): entry is ConfigProject => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ]
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const agentPath = (projectPath: string, name: string): string =>
  path.join(configDir(projectPath), 'agents', `${safeName(name)}.md`)

export async function listAgents(projectPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(configDir(projectPath), 'agents'), {
      withFileTypes: true,
    })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name.slice(0, -3))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export const getAgent = (projectPath: string, name: string): Promise<string | null> =>
  readIfExists(agentPath(projectPath, name))

export const setAgent = (projectPath: string, name: string, content: string): Promise<void> =>
  writeEnsuringDir(agentPath(projectPath, name), content)

export async function createAgent(
  projectPath: string,
  name: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  const target = agentPath(projectPath, name)
  if ((await readIfExists(target)) !== null) {
    return { ok: false, error: `An agent named "${name}" already exists in this scope.` }
  }
  await writeEnsuringDir(target, content)
  return { ok: true }
}

export async function deleteAgent(projectPath: string, name: string): Promise<void> {
  await fs.rm(agentPath(projectPath, name), { force: true })
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const skillDir = (projectPath: string, name: string): string =>
  path.join(configDir(projectPath), 'skills', safeName(name))

/** A skill exists iff its directory contains a SKILL.md — same test the CLI uses. */
export async function listSkills(projectPath: string): Promise<string[]> {
  const root = path.join(configDir(projectPath), 'skills')
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const checks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) =>
        (await readIfExists(path.join(root, entry.name, 'SKILL.md'))) === null ? null : entry.name,
      ),
  )
  return checks.filter((name): name is string => name !== null).sort((a, b) => a.localeCompare(b))
}

export async function createSkill(
  projectPath: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const dir = skillDir(projectPath, name)
  if ((await readIfExists(path.join(dir, 'SKILL.md'))) !== null) {
    return { ok: false, error: `A skill named "${name}" already exists in this scope.` }
  }
  await writeEnsuringDir(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: \n---\n\n`,
  )
  return { ok: true }
}

export async function deleteSkill(projectPath: string, name: string): Promise<void> {
  await fs.rm(skillDir(projectPath, name), { recursive: true, force: true })
}

/**
 * The editable contents of a skill: markdown files at the top level (SKILL.md
 * first) and everything under `scripts/`. Other subdirectories are left alone —
 * the UI edits what it understands and preserves the rest by not touching it.
 */
export async function skillFiles(projectPath: string, name: string): Promise<SkillFiles> {
  const dir = skillDir(projectPath, name)
  const files: string[] = []
  const scripts: string[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(entry.name)
    }
  } catch {
    return { files, scripts }
  }

  try {
    const entries = await fs.readdir(path.join(dir, 'scripts'), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) scripts.push(path.join('scripts', entry.name))
    }
  } catch {
    // No scripts dir is the common case.
  }

  files.sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)))
  scripts.sort((a, b) => a.localeCompare(b))
  return { files, scripts }
}

export const readSkillFile = (
  projectPath: string,
  name: string,
  file: string,
): Promise<string | null> => readIfExists(safeRelative(skillDir(projectPath, name), file))

export const writeSkillFile = (
  projectPath: string,
  name: string,
  file: string,
  content: string,
): Promise<void> => writeEnsuringDir(safeRelative(skillDir(projectPath, name), file), content)

export async function deleteSkillFile(
  projectPath: string,
  name: string,
  file: string,
): Promise<void> {
  if (path.basename(file) === 'SKILL.md') {
    throw new Error('SKILL.md defines the skill — delete the skill instead.')
  }
  await fs.rm(safeRelative(skillDir(projectPath, name), file), { force: true })
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const settingsPath = (projectPath: string): string =>
  path.join(configDir(projectPath), 'settings.json')

/**
 * Older Claude Code versions wrote flat `{command, type, if}` entries where the
 * current shape is a matcher group `{matcher, hooks: [handler...]}`. Normalize on
 * read so the editor only ever sees the modern shape; the migration is written
 * back the next time the user saves.
 */
function normalizeGroup(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) return entry
  const record = entry as Record<string, unknown>
  if (Array.isArray(record.hooks)) return entry

  const { matcher, if: condition, ...handler } = record
  return {
    matcher: typeof matcher === 'string' ? matcher : '',
    hooks: [condition === undefined ? handler : { ...handler, if: condition }],
  }
}

export async function getHooks(projectPath: string): Promise<HooksConfig> {
  const raw = await readIfExists(settingsPath(projectPath))
  if (!raw) return {}

  try {
    const settings = JSON.parse(raw) as { hooks?: Record<string, unknown> }
    const hooks = settings.hooks ?? {}
    const normalized: HooksConfig = {}
    for (const [event, groups] of Object.entries(hooks)) {
      if (Array.isArray(groups)) normalized[event] = groups.map(normalizeGroup)
    }
    return normalized
  } catch {
    return {}
  }
}

/** Read-modify-write so every settings.json key this app doesn't manage survives. */
export async function setHooks(projectPath: string, hooks: HooksConfig): Promise<void> {
  const target = settingsPath(projectPath)
  const raw = await readIfExists(target)

  let settings: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) settings = parsed
    } catch {
      throw new Error(
        'settings.json contains invalid JSON — fix it by hand before editing hooks here.',
      )
    }
  }

  settings.hooks = hooks
  await writeEnsuringDir(target, JSON.stringify(settings, null, 2) + '\n')
}
