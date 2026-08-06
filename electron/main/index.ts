import { app, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionManager } from './session/SessionManager'
import { TerminalManager } from './terminal/TerminalManager'
import { registerIpc, unregisterIpc } from './ipc/register'

// The main bundle is ESM, so __dirname does not exist. Derive it.
const dirname = path.dirname(fileURLToPath(import.meta.url))

const DIST_ELECTRON = path.join(dirname, '..')
const DIST_RENDERER = path.join(DIST_ELECTRON, '../dist')
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

/**
 * App identity.
 *
 * In development Electron reports itself as "Electron" — that name reaches the
 * macOS menu bar, the About panel, `~/Library/Application Support`, and every
 * notification. Setting it before `whenReady()` is what makes the dev app and the
 * packaged app the same product rather than a generic shell running our code.
 *
 * Packaged builds take the name from electron-builder's `productName`; setting it
 * here as well costs nothing and keeps the two identical.
 */
const APP_NAME = 'ClaudeView'
app.setName(APP_NAME)

// Regenerate with `npm run icon`. Packaged macOS builds get the .icns via
// electron-builder's `build/` convention; this path is what dresses the dev dock.
const ICON_PATH = path.join(DIST_ELECTRON, '../build/icon.png')

let window: BrowserWindow | null = null
const sessions = new SessionManager(() => window?.webContents ?? null)
const terminals = new TerminalManager(() => window?.webContents ?? null)

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    icon: ICON_PATH,
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
      /*
       * Keep rendering when the window isn't frontmost.
       *
       * Chromium stops `requestAnimationFrame` entirely for an occluded window, and
       * this app's text reveal is driven by rAF (`src/lib/streamBuffers.ts`). With
       * throttling on, a turn that streams while ClaudeView sits behind an editor
       * freezes mid-sentence and then snaps to the end when you switch back —
       * because the backlog has grown past the instant-reveal threshold. Watching a
       * long run in a side window is exactly what this app is for, so the frames
       * are worth the battery.
       */
      backgroundThrottling: false,
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
    terminals.disposeAll()
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
    // The dock reads its image from here, not from the BrowserWindow, so a dev run
    // shows the Electron logo without this.
    if (process.platform === 'darwin' && fs.existsSync(ICON_PATH)) {
      app.dock?.setIcon(ICON_PATH)
    }

    registerIpc(sessions, terminals, () => window)
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
  if (shuttingDown || (sessions.size === 0 && terminals.size === 0)) return
  event.preventDefault()
  shuttingDown = true
  terminals.disposeAll()
  void sessions.disposeAll().finally(() => {
    unregisterIpc()
    app.quit()
  })
})
