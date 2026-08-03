import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { api } from '@/lib/api'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { FONT_STACKS, resolveFont } from '@/lib/theme'
import '@xterm/xterm/css/xterm.css'

/** Read a themed CSS variable as a concrete colour for xterm, which needs literals. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * A shell in a panel, backed by a real PTY in the main process.
 *
 * ## Why xterm rather than a textarea
 *
 * A shell emits ANSI escape sequences for colour, cursor movement, and full-screen
 * apps (`vim`, `htop`, `git log`). Anything less than a real terminal emulator
 * renders those as garbage. xterm.js is the emulator; `node-pty` on the other side
 * provides the actual TTY, so programs behave as though they're in a terminal —
 * including line editing and job control.
 *
 * ## Scrollback replay
 *
 * Changing the layout unmounts and remounts panels, and a fresh xterm starts blank.
 * On mount the component asks main for the retained scrollback and writes it back,
 * so rearranging panels doesn't appear to wipe your terminals.
 */
export function TerminalPanel({
  terminalId,
  cwd,
  focused,
  onFocus,
}: {
  terminalId: string
  cwd?: string
  focused: boolean
  onFocus: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const font = useAppearanceStore((state) => state.font)
  const fontSize = useAppearanceStore((state) => state.fontSize)
  const colorway = useAppearanceStore((state) => state.colorway)

  // Create the emulator and PTY once per terminal id.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: FONT_STACKS[resolveFont(font)].mono,
      fontSize,
      // Slightly looser than the default; matches the app's reading rhythm.
      lineHeight: 1.2,
      scrollback: 5000,
      theme: {
        background: cssVar('--bg'),
        foreground: cssVar('--text'),
        cursor: cssVar('--accent'),
        selectionBackground: cssVar('--accent-wash'),
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    termRef.current = term
    fitRef.current = fit

    let disposed = false

    const start = async () => {
      // Fit first so the PTY is created with the real size — creating it at a
      // guessed 80x24 and resizing after makes the first output visibly reflow.
      fit.fit()
      await api['terminal:create']({
        id: terminalId,
        cwd,
        cols: term.cols,
        rows: term.rows,
      })
      if (disposed) return

      // Restore what was on screen before this panel was remounted.
      const scrollback = await api['terminal:scrollback']({ id: terminalId })
      if (!disposed && scrollback) term.write(scrollback)
    }
    void start()

    // Keystrokes go straight to the PTY; the shell owns echo and line editing.
    const inputDisposable = term.onData((data) => {
      void api['terminal:write']({ id: terminalId, data })
    })

    const observer = new ResizeObserver(() => {
      if (disposed) return
      try {
        fit.fit()
        void api['terminal:resize']({ id: terminalId, cols: term.cols, rows: term.rows })
      } catch {
        // Fitting a zero-size element (a panel mid-transition) throws; harmless.
      }
    })
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      inputDisposable.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      // The PTY deliberately outlives the component: a layout change must not
      // kill your shell. `closePanel` is what ends it.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  // Subscribe to output for this terminal.
  useEffect(() => {
    const unsubscribe = api.onTerminalEvent((envelope) => {
      if (envelope.id !== terminalId) return
      const term = termRef.current
      if (!term) return

      if (envelope.kind === 'data') {
        term.write(envelope.data)
      } else {
        term.write(`\r\n\x1b[2m[process exited with code ${envelope.exitCode}]\x1b[0m\r\n`)
      }
    })
    return unsubscribe
  }, [terminalId])

  // Re-theme in place when appearance changes, rather than recreating the terminal
  // (which would clear the screen).
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontFamily = FONT_STACKS[resolveFont(font)].mono
    term.options.fontSize = fontSize
    term.options.theme = {
      background: cssVar('--bg'),
      foreground: cssVar('--text'),
      cursor: cssVar('--accent'),
      selectionBackground: cssVar('--accent-wash'),
    }
    fitRef.current?.fit()
  }, [font, fontSize, colorway])

  useEffect(() => {
    if (focused) termRef.current?.focus()
  }, [focused])

  return (
    <div
      ref={hostRef}
      onMouseDown={onFocus}
      className="h-full w-full overflow-hidden px-2 py-2"
      data-selectable
    />
  )
}
