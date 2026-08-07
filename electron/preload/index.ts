import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { Api, StreamEnvelope, TerminalEnvelope } from '../../shared/ipc'
import { STREAM_CHANNEL, TERMINAL_CHANNEL } from '../../shared/ipc'

/**
 * The only bridge between the renderer and Node.
 *
 * With `contextIsolation: true`, this is a hard security boundary: the renderer
 * renders model-authored markdown as HTML, so it must never hold `ipcRenderer`,
 * `require`, or anything reachable from them. Exposing a fixed set of named
 * functions — rather than a generic `invoke(channel, payload)` — means a rendering
 * escape can only call these nine operations, not arbitrary IPC channels.
 */
const api: Api = {
  'session:create': (payload) => ipcRenderer.invoke('session:create', payload),
  'session:send': (payload) => ipcRenderer.invoke('session:send', payload),
  'session:interrupt': (payload) => ipcRenderer.invoke('session:interrupt', payload),
  'session:set-permission-mode': (payload) =>
    ipcRenderer.invoke('session:set-permission-mode', payload),
  'session:set-model': (payload) => ipcRenderer.invoke('session:set-model', payload),
  'session:close': (payload) => ipcRenderer.invoke('session:close', payload),
  'sessions:list': (payload) => ipcRenderer.invoke('sessions:list', payload),
  'app:pick-directory': () => ipcRenderer.invoke('app:pick-directory'),
  'app:pick-attachments': (payload) => ipcRenderer.invoke('app:pick-attachments', payload),
  'terminal:create': (payload) => ipcRenderer.invoke('terminal:create', payload),
  'terminal:write': (payload) => ipcRenderer.invoke('terminal:write', payload),
  'terminal:resize': (payload) => ipcRenderer.invoke('terminal:resize', payload),
  'terminal:close': (payload) => ipcRenderer.invoke('terminal:close', payload),
  'terminal:snapshot': (payload) => ipcRenderer.invoke('terminal:snapshot', payload),
  'app:info': () => ipcRenderer.invoke('app:info'),
  'config:projects:list': () => ipcRenderer.invoke('config:projects:list'),
  'config:agents:list': (payload) => ipcRenderer.invoke('config:agents:list', payload),
  'config:agents:get': (payload) => ipcRenderer.invoke('config:agents:get', payload),
  'config:agents:set': (payload) => ipcRenderer.invoke('config:agents:set', payload),
  'config:agents:create': (payload) => ipcRenderer.invoke('config:agents:create', payload),
  'config:agents:delete': (payload) => ipcRenderer.invoke('config:agents:delete', payload),
  'config:skills:list': (payload) => ipcRenderer.invoke('config:skills:list', payload),
  'config:skills:create': (payload) => ipcRenderer.invoke('config:skills:create', payload),
  'config:skills:delete': (payload) => ipcRenderer.invoke('config:skills:delete', payload),
  'config:skills:files': (payload) => ipcRenderer.invoke('config:skills:files', payload),
  'config:skills:read': (payload) => ipcRenderer.invoke('config:skills:read', payload),
  'config:skills:write': (payload) => ipcRenderer.invoke('config:skills:write', payload),
  'config:skills:delete-file': (payload) => ipcRenderer.invoke('config:skills:delete-file', payload),
  'config:hooks:get': (payload) => ipcRenderer.invoke('config:hooks:get', payload),
  'config:hooks:set': (payload) => ipcRenderer.invoke('config:hooks:set', payload),

  onStreamEvent: (handler) => {
    // The IpcRendererEvent is deliberately not forwarded: it carries `sender`,
    // which would hand the renderer a capability the bridge is meant to withhold.
    const listener = (_event: IpcRendererEvent, envelope: StreamEnvelope) => handler(envelope)
    ipcRenderer.on(STREAM_CHANNEL, listener)
    return () => ipcRenderer.removeListener(STREAM_CHANNEL, listener)
  },

  onTerminalEvent: (handler) => {
    const listener = (_event: IpcRendererEvent, envelope: TerminalEnvelope) => handler(envelope)
    ipcRenderer.on(TERMINAL_CHANNEL, listener)
    return () => ipcRenderer.removeListener(TERMINAL_CHANNEL, listener)
  },

  // `webUtils` lives here rather than in the renderer because it is part of the
  // Electron module, which the renderer must never hold. Handing back only the
  // resolved strings keeps the capability behind the bridge.
  resolveDroppedPaths: (files) =>
    files.map((file) => webUtils.getPathForFile(file)).filter((path) => path.length > 0),
}

contextBridge.exposeInMainWorld('claudeview', api)
