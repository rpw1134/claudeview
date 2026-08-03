import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionManager } from './session/SessionManager'
import { registerIpc, unregisterIpc } from './ipc/register'

// The main bundle is ESM, so __dirname does not exist. Derive it.
const dirname = path.dirname(fileURLToPath(import.meta.url))

const DIST_ELECTRON = path.join(dirname, '..')
const DIST_RENDERER = path.join(DIST_ELECTRON, '../dist')
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let window: BrowserWindow | null = null
const sessions = new SessionManager(() => window?.webContents ?? null)

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    // Frameless-ish chrome on macOS: keeps the traffic lights but lets the tab
    // strip occupy the title bar area.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0b0b0d',
    webPreferences: {
      preload: path.join(DIST_ELECTRON, 'preload/index.cjs'),
      // The renderer runs untrusted-ish content (model output rendered as HTML).
      // It gets no Node access and no direct access to anything but the narrow
      // preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  })

  // Avoid a white flash before React paints.
  window.once('ready-to-show', () => window?.show())

  // Any link the model emits opens in the real browser, never in-app — an in-app
  // navigation would replace the UI with an attacker-influenced page.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window?.webContents.getURL()) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  window.on('closed', () => {
    window = null
    // Dispose here rather than in `before-quit`: on macOS the window can close
    // while the app keeps running, and every live session is a subprocess we would
    // otherwise strand with no UI left to manage it.
    void sessions.disposeAll()
  })

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL)
    // Opt-in rather than automatic: a detached DevTools window on every launch
    // covers the app and has to be dismissed each time. Run with
    // `CLAUDEVIEW_DEVTOOLS=1 npm run dev` when you actually want it.
    if (process.env.CLAUDEVIEW_DEVTOOLS === '1') {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void window.loadFile(path.join(DIST_RENDERER, 'index.html'))
  }
}

// One window is enough; a second instance should focus the existing one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  void app.whenReady().then(() => {
    registerIpc(sessions, () => window)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * Last-chance cleanup. `disposeAll()` is async and quit is not, so hold the quit
 * once while sessions shut down, then quit for real. Without this a pending turn
 * can leave a `claude` subprocess behind after the app disappears.
 */
let shuttingDown = false
app.on('before-quit', (event) => {
  if (shuttingDown || sessions.size === 0) return
  event.preventDefault()
  shuttingDown = true
  void sessions.disposeAll().finally(() => {
    unregisterIpc()
    app.quit()
  })
})
