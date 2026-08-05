import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
// See electron/main/sdk.ts — the SDK must not be statically ESM-imported here.
import { listSessions } from '../sdk'
import os from 'node:os'
import type { IpcCalls, SessionSummary } from '../../../shared/ipc'
import type { SessionManager } from '../session/SessionManager'
import type { TerminalManager } from '../terminal/TerminalManager'

/**
 * Type-safe wrapper over `ipcMain.handle`.
 *
 * Binding the channel name to its request/response types from `IpcCalls` means a
 * handler whose signature drifts from the contract fails to compile, instead of
 * failing at runtime as an `undefined` in the UI.
 */
function handle<K extends keyof IpcCalls>(
  channel: K,
  handler: (payload: IpcCalls[K][0]) => Promise<IpcCalls[K][1]> | IpcCalls[K][1],
): void {
  ipcMain.handle(channel, (_event, payload) => handler(payload as IpcCalls[K][0]))
}

export function registerIpc(
  sessions: SessionManager,
  terminals: TerminalManager,
  getWindow: () => BrowserWindow | null,
): void {
  handle('session:create', async (request) => {
    try {
      await sessions.create(request)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  /**
   * A send reports whether it was actually accepted.
   *
   * It used to return void, so a message posted to a disposed runner — or to a tab
   * id with no runner at all — looked exactly like a successful one. The turn simply
   * never happened, and the only signal was the UI sitting still.
   */
  handle('session:send', ({ tabId, text, turnId }) => {
    const runner = sessions.get(tabId)
    if (!runner) return { ok: false, error: 'This session is no longer running.' }
    return runner.send(text, turnId)
      ? { ok: true }
      : { ok: false, error: 'This session has ended and cannot accept messages.' }
  })

  handle('session:interrupt', async ({ tabId }) => {
    await sessions.get(tabId)?.interrupt()
  })

  handle('session:set-permission-mode', async ({ tabId, mode }) => {
    await sessions.get(tabId)?.setPermissionMode(mode)
  })

  handle('session:set-model', async ({ tabId, model }) => {
    await sessions.get(tabId)?.setModel(model)
  })

  handle('session:close', async ({ tabId }) => {
    await sessions.close(tabId)
  })

  /**
   * Sessions on disk, for the resume picker.
   *
   * The renderer keeps its own tab list in localStorage, but that only knows about
   * sessions this app started. `listSessions()` reads the same `~/.claude/projects`
   * store the CLI writes, so terminal sessions show up here too — which is the
   * point, since the goal is to stop living in the terminal without losing history.
   */
  handle('sessions:list', async ({ cwd, limit }) => {
    try {
      const found = await listSessions({ dir: cwd, limit: limit ?? 50 })
      return found.map(toSummary)
    } catch {
      // A missing or unreadable session store is normal on a fresh machine.
      return []
    }
  })

  handle('app:pick-directory', async () => {
    const window = getWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a working directory',
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  /**
   * Attachment picker. `directories` swaps the dialog between files and folders
   * because macOS will not offer both in one panel without the selection rules
   * becoming ambiguous — you get a picker that accepts either and communicates
   * neither.
   */
  handle('app:pick-attachments', async ({ directories }) => {
    const window = getWindow()
    if (!window) return []
    const result = await dialog.showOpenDialog(window, {
      properties: directories
        ? ['openDirectory', 'multiSelections']
        : ['openFile', 'multiSelections'],
      title: directories ? 'Attach folders' : 'Attach files',
    })
    return result.canceled ? [] : result.filePaths
  })

  handle('terminal:create', ({ id, cwd, cols, rows }) => {
    terminals.create(id, { cwd, cols, rows })
  })

  handle('terminal:write', ({ id, data }) => {
    terminals.write(id, data)
  })

  handle('terminal:resize', ({ id, cols, rows }) => {
    terminals.resize(id, cols, rows)
  })

  handle('terminal:close', ({ id }) => {
    terminals.close(id)
  })

  handle('terminal:snapshot', ({ id }) => terminals.snapshot(id))

  handle('app:info', () => ({
    cwd: process.cwd(),
    version: app.getVersion(),
    home: os.homedir(),
  }))
}

/** Remove every handler. Paired with `registerIpc` so a reload can't double-register. */
export function unregisterIpc(): void {
  const channels: (keyof IpcCalls)[] = [
    'session:create',
    'session:send',
    'session:interrupt',
    'session:set-permission-mode',
    'session:set-model',
    'session:close',
    'sessions:list',
    'app:pick-directory',
    'app:pick-attachments',
    'app:info',
    'terminal:create',
    'terminal:write',
    'terminal:resize',
    'terminal:close',
    'terminal:snapshot',
  ]
  for (const channel of channels) ipcMain.removeHandler(channel)
}

/**
 * Normalize the SDK's session record into our summary shape.
 *
 * Field names have shifted across SDK versions, so read defensively rather than
 * binding tightly to one shape — a renamed timestamp should cost a missing
 * "2 hours ago" label, not an exception that empties the whole picker.
 */
function toSummary(raw: unknown): SessionSummary {
  const record = (raw ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): unknown => keys.map((k) => record[k]).find((v) => v != null)

  const timestamp = pick('lastModified', 'updatedAt', 'modifiedAt', 'timestamp')

  return {
    sessionId: String(pick('sessionId', 'id') ?? ''),
    title: asString(pick('title', 'summary', 'name')),
    cwd: asString(pick('cwd', 'dir', 'projectPath')),
    updatedAt: toEpochMs(timestamp),
    messageCount: typeof record.messageCount === 'number' ? record.messageCount : undefined,
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  if (value instanceof Date) return value.getTime()
  return undefined
}
