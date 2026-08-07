import yaml from 'js-yaml'

/**
 * YAML frontmatter for agent files and SKILL.md files.
 *
 * Shared between the main process (which reads and writes the files) and the
 * renderer (which edits them as forms), so both sides agree on what a field is.
 * Parsing fails soft on purpose: a hand-edited file with broken YAML opens as
 * "no frontmatter, everything is body" instead of refusing to open at all —
 * these are the user's own files and locking them out of their own typo is
 * worse than showing it.
 *
 * Ported from the Stryde config editor (claude-config-editor), which treats
 * config content as opaque strings server-side and keeps all structure here.
 */

/** Fields Claude Code understands on an agent file. Unknown keys survive round-trips. */
export type AgentFrontmatter = {
  name?: string
  description?: string
  model?: string
  tools?: string[]
  disallowedTools?: string[]
  permissionMode?: string
  maxTurns?: number
  memory?: string
  background?: boolean
  effort?: string
  isolation?: string
  color?: string
  initialPrompt?: string
  mcpServers?: string[]
  skills?: string[]
  [key: string]: unknown
}

/** Fields Claude Code understands on a SKILL.md. Unknown keys survive round-trips. */
export type SkillFrontmatter = {
  name?: string
  description?: string
  when_to_use?: string
  'argument-hint'?: string
  'user-invocable'?: boolean
  'disable-model-invocation'?: boolean
  'allowed-tools'?: string[]
  model?: string
  effort?: string
  context?: string
  [key: string]: unknown
}

export type Parsed<T> = { frontmatter: T; body: string }

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function parse<T extends Record<string, unknown>>(content: string): Parsed<T> {
  const match = FRONTMATTER_PATTERN.exec(content)
  if (!match) return { frontmatter: {} as T, body: content }

  try {
    const data = yaml.load(match[1]!)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return { frontmatter: {} as T, body: content }
    }
    return { frontmatter: data as T, body: content.slice(match[0].length) }
  } catch {
    // Malformed YAML: treat the whole file as body rather than throwing.
    return { frontmatter: {} as T, body: content }
  }
}

export const parseAgentFrontmatter = (content: string): Parsed<AgentFrontmatter> => parse(content)
export const parseSkillFrontmatter = (content: string): Parsed<SkillFrontmatter> => parse(content)

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/**
 * Serialize frontmatter + body back to a file.
 *
 * Empty values are dropped so a form full of untouched fields doesn't bloat the
 * file with `field: ""` lines. `name` and `description` lead — they're what a
 * human scans for — and the rest is alphabetical so diffs are stable no matter
 * which form field was edited last.
 */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const entries = Object.entries(frontmatter).filter(([, value]) => !isEmpty(value))
  if (entries.length === 0) return body

  const leading = ['name', 'description']
  entries.sort(([a], [b]) => {
    const ai = leading.indexOf(a)
    const bi = leading.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? leading.length : ai) - (bi === -1 ? leading.length : bi)
    return a.localeCompare(b)
  })

  const dumped = yaml.dump(Object.fromEntries(entries), { lineWidth: -1 })
  return `---\n${dumped}---\n\n${body.replace(/^\n+/, '')}`
}
