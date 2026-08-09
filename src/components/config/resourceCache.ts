/**
 * Per-scope cache for the agent/skill list rows' description (and an agent's
 * model badge).
 *
 * The list call (`config:agents:list` / `config:skills:list`) only returns
 * names — showing a description means a follow-up file read per row. Caching
 * those reads at module scope means switching sections and coming back
 * doesn't re-fetch or flash empty rows; only a genuinely new name pays the
 * read.
 */
export type ResourceMeta = { description: string; model?: string }

const cache = new Map<string, ResourceMeta>()

export const metaKey = (kind: 'agents' | 'skills', projectPath: string, name: string): string =>
  `${kind}:${projectPath}:${name}`

export const getCachedMeta = (key: string): ResourceMeta | undefined => cache.get(key)

export const setCachedMeta = (key: string, meta: ResourceMeta): void => {
  cache.set(key, meta)
}

/** Lowercase-hyphen rule shared by agent and skill names. */
export const isValidResourceName = (name: string): boolean => /^[a-z0-9-]+$/.test(name)
