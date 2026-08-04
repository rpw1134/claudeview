import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { listSubagents } from '../sdk'

/**
 * Finding a resumed session's subagent transcripts.
 *
 * ## Why this needs more than the SDK call
 *
 * `listSubagents()` returns agent *ids* — opaque strings like `a29ff2c4d02dfe2ea`.
 * That is not enough to rebuild the UI, because the renderer keys subagent lanes by
 * the **`tool_use.id` of the Task call that spawned them**, not by agent id. That
 * choice is what lets a Task row in the main transcript carry an "Open" button
 * pointing at the right lane, and it's forced on us live: streamed subagent messages
 * carry `parent_tool_use_id` and nothing else identifying.
 *
 * The bridge between the two is a sidecar the CLI writes next to each transcript:
 *
 * ```
 * ~/.claude/projects/<project>/<sessionId>/subagents/agent-<agentId>.meta.json
 * { "agentType": "Explore", "description": "Find EventBatcher class",
 *   "toolUseId": "toolu_01YRe…", "spawnDepth": 1 }
 * ```
 *
 * Reading it gives a resumed lane the same id, type, and description it had live —
 * so a resumed session's subagent tabs are indistinguishable from a live one's.
 *
 * ## Why the directory is searched rather than computed
 *
 * The project folder name is a lossy encoding of the cwd (`/Users/x/Projects/y` ->
 * `-Users-x-Projects-y`), and the exact rules have shifted across CLI versions.
 * Reproducing that transform here would silently return nothing the first time it
 * drifted. Scanning for the session id instead is a directory listing over a folder
 * with tens of entries, and it stays correct whatever the encoding does next.
 */

export type SubagentLane = {
  agentId: string
  /** `tool_use.id` of the spawning Task call — the lane id the UI uses. */
  toolUseId?: string
  /** Subagent type, e.g. `Explore`. */
  agentType?: string
  description?: string
  /** 1 for subagents spawned by the main thread, higher for nested ones. */
  spawnDepth?: number
}

type SubagentMeta = {
  agentType?: unknown
  description?: unknown
  toolUseId?: unknown
  spawnDepth?: unknown
}

/**
 * Every subagent transcript belonging to a session, with its lane identity.
 *
 * Never throws: a session with no subagents, an unreadable store, or a CLI version
 * that doesn't write sidecars all return `[]`. Missing subagent scrollback is worth
 * a degraded transcript, never a failed resume.
 */
export async function listSubagentLanes(
  sessionId: string,
  cwd: string | undefined,
): Promise<SubagentLane[]> {
  let agentIds: string[]
  try {
    agentIds = await listSubagents(sessionId, { dir: cwd })
  } catch {
    return []
  }
  if (agentIds.length === 0) return []

  const directory = await findSubagentDir(sessionId)

  return Promise.all(
    agentIds.map(async (agentId) => ({ agentId, ...(await readMeta(directory, agentId)) })),
  )
}

/** Locate `<project>/<sessionId>/subagents`, or undefined if it isn't there. */
async function findSubagentDir(sessionId: string): Promise<string | undefined> {
  const root = path.join(os.homedir(), '.claude', 'projects')

  let projects: string[]
  try {
    projects = await fs.readdir(root)
  } catch {
    return undefined
  }

  for (const project of projects) {
    const candidate = path.join(root, project, sessionId, 'subagents')
    try {
      const stats = await fs.stat(candidate)
      if (stats.isDirectory()) return candidate
    } catch {
      // Not this project. Keep looking.
    }
  }
  return undefined
}

async function readMeta(
  directory: string | undefined,
  agentId: string,
): Promise<Omit<SubagentLane, 'agentId'>> {
  if (!directory) return {}

  try {
    const raw = await fs.readFile(path.join(directory, `agent-${agentId}.meta.json`), 'utf8')
    const meta = JSON.parse(raw) as SubagentMeta
    return {
      toolUseId: asString(meta.toolUseId),
      agentType: asString(meta.agentType),
      description: asString(meta.description),
      spawnDepth: typeof meta.spawnDepth === 'number' ? meta.spawnDepth : undefined,
    }
  } catch {
    // No sidecar: the lane still replays, keyed by agent id instead of tool use id.
    // It loses only the "Open" link from the spawning Task row.
    return {}
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
