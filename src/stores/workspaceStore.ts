import { create } from 'zustand'
import { api } from '@/lib/api'
import { useSessionStore } from './sessionStore'
import {
  balance,
  collectPanelIds,
  insertPanel,
  leaf,
  movePanel,
  removePanel,
  setRatio,
  swapPanels,
  type DropPosition,
  type LayoutNode,
  type SplitDirection,
} from '@/lib/layoutTree'

/**
 * The panel workspace: what's open, how it's arranged, and which panel has focus.
 *
 * Arrangement lives in a binary split tree (`src/lib/layoutTree.ts`) rather than a
 * list plus a preset. The tree always fills the viewport exactly, supports any
 * arrangement the user drags into being, and makes both "drop a panel here" and
 * "drag this divider" operations on one structure.
 *
 * Panels hold a *reference* — a session tab id or a terminal id — never the state
 * itself. Sessions and shells therefore survive being dragged to a new position,
 * which is the whole point of moving a panel rather than recreating it.
 */

export type PanelKind = 'session' | 'terminal'

export type Panel = {
  id: string
  kind: PanelKind
  /** Session tab id, or terminal id. */
  refId: string
  title: string
  cwd?: string
  /**
   * Present while a session panel is waiting to be aimed.
   *
   * A panel opened by ⌥T, the toolbar, or a split has no directory the user
   * chose — inheriting one silently started a subprocess somewhere nobody
   * picked, and the only way to correct it was to close the panel and start
   * over. So the panel now exists *before* the session does: it holds a
   * proposed cwd (the focused panel's, as a default), shows a start form, and
   * spawns nothing until Start. Its presence is what marks the pre-start state
   * — `cwd` stays unset until the choice is committed, so the header never
   * claims a directory the session isn't running in.
   */
  pending?: { cwd?: string }
}

export const MAX_PANELS = 8

type WorkspaceState = {
  panels: Panel[]
  layout: LayoutNode | null
  focusedPanelId: string | null
  /** Panel currently being dragged, so the grid can dim it. */
  draggingPanelId: string | null
  /**
   * Increments on every keyboard focus change. Panels watch it to decide when to
   * pull the caret into their input; a counter rather than a boolean so switching
   * back to the same panel re-focuses rather than being a no-op.
   */
  autoFocusToken: number
  /**
   * Which activity the workspace surface shows: the panel mosaic, or review.
   * Distinct from the `view` state in App.tsx — that swaps the *whole window*
   * between workspace and config, while `mode` swaps what fills the workspace
   * half of that split. Panels stay mounted underneath either way.
   */
  mode: 'panels' | 'review'

  /**
   * Focus a panel. `viaKeyboard` additionally bumps `autoFocusToken`, which is what
   * moves the caret into that panel's input — pointer focus deliberately does not,
   * or clicking into a transcript to select text would yank the caret away.
   */
  focusPanel: (panelId: string, viaKeyboard?: boolean) => void
  /** Move focus to the next/previous panel in visual order. */
  cyclePanel: (delta: 1 | -1) => void
  toggleMode: () => void
  setMode: (mode: 'panels' | 'review') => void
  addPanel: (
    kind: PanelKind,
    options?: {
      cwd?: string
      resume?: string
      title?: string
      direction?: SplitDirection
      /**
       * The caller already knows where this session belongs, so skip the start
       * form and spawn immediately. Set by the landing page — it picked the
       * directory, or is resuming a session that carries its own.
       */
      start?: boolean
    },
  ) => Promise<void>
  /** Change a pre-start panel's proposed directory, before anything is spawned. */
  setPanelPendingCwd: (panelId: string, cwd?: string) => void
  /** Commit a pre-start panel: spawn its session in the chosen directory. */
  startPanelSession: (panelId: string, cwd?: string) => Promise<void>
  closePanel: (panelId: string) => Promise<void>
  renamePanel: (panelId: string, title: string) => void

  setDragging: (panelId: string | null) => void
  /** Commit a drag: move next to the target, or swap with it. */
  dropPanel: (panelId: string, targetPanelId: string, position: DropPosition) => void
  resizeSplit: (splitId: string, ratio: number) => void
  balanceLayout: () => void
}

const newId = (): string => crypto.randomUUID()

export const useWorkspaceStore = create<WorkspaceState>()((setState, getState) => ({
  panels: [],
  layout: null,
  focusedPanelId: null,
  draggingPanelId: null,
  autoFocusToken: 0,
  mode: 'panels',

  toggleMode: () =>
    setState((state) => ({ mode: state.mode === 'panels' ? 'review' : 'panels' })),

  setMode: (mode) => setState({ mode }),

  focusPanel: (panelId, viaKeyboard = false) =>
    setState((state) => ({
      focusedPanelId: panelId,
      autoFocusToken: viaKeyboard ? state.autoFocusToken + 1 : state.autoFocusToken,
    })),

  cyclePanel: (delta) => {
    const state = getState()
    // Visual order, so cycling follows the layout rather than creation order.
    const order = collectPanelIds(state.layout)
    if (order.length === 0) return

    const index = order.indexOf(state.focusedPanelId ?? '')
    const next = order[(index + delta + order.length) % order.length]!
    setState({ focusedPanelId: next, autoFocusToken: state.autoFocusToken + 1 })
  },

  addPanel: async (kind, options = {}) => {
    const state = getState()
    if (state.panels.length >= MAX_PANELS) return

    const panelId = newId()
    const refId = newId()

    /*
     * A panel created without an explicit directory *proposes* the focused
     * panel's. ⌥T beside a session working in ~/projects/foo almost always
     * means "another one, here" — but "almost always" is not "always", and an
     * inherited cwd applied silently is a guess the user can't see or correct.
     * So for sessions it becomes a default in the start form rather than a
     * fait accompli. Resumes are unaffected: they arrive with their own cwd.
     * A pre-start panel proposes its own pending cwd onward, so ⌥T twice in a
     * row doesn't lose the directory you were about to choose.
     */
    const focused = selectFocusedPanel(state)
    const inherited = focused?.cwd ?? focused?.pending?.cwd
    const cwd = options.cwd ?? (options.resume ? undefined : inherited)

    /*
     * Terminals still auto-start: a shell prints its directory in the prompt,
     * so it states where it is without being asked, and `cd` is the correction.
     * A session states nothing until it has already acted, which is why only
     * sessions are worth a form.
     */
    const deferStart = kind === 'session' && !options.start && !options.resume

    const panel: Panel = {
      id: panelId,
      kind,
      refId,
      // A terminal is named for where it is — with several open, "Terminal,
      // Terminal, Terminal" makes the titles pure decoration.
      title:
        options.title ??
        (kind === 'terminal'
          ? (cwd?.split('/').filter(Boolean).pop() ?? 'Terminal')
          : 'New session'),
      // Unset while pending: the panel isn't running anywhere yet.
      cwd: deferStart ? undefined : cwd,
      pending: deferStart ? { cwd } : undefined,
    }

    // Split the focused panel, along its longer axis unless told otherwise, so a
    // new panel takes space from where the user is looking rather than from an
    // arbitrary corner. Splitting the long way keeps both halves usable.
    const target = state.focusedPanelId ?? state.panels[state.panels.length - 1]?.id
    const direction: SplitDirection = options.direction ?? 'row'
    const position = direction === 'row' ? 'right' : 'bottom'

    setState({
      panels: [...state.panels, panel],
      layout:
        state.layout && target
          ? insertPanel(state.layout, target, panelId, position)
          : leaf(panelId),
      focusedPanelId: panelId,
    })

    if (kind === 'session' && !deferStart) {
      await useSessionStore.getState().openTabWithId(refId, {
        cwd,
        resume: options.resume,
        title: options.title,
      })
    }
    // Terminals are created by the panel component, which knows its pixel size and
    // can therefore spawn the PTY at the right cols/rows the first time.
  },

  setPanelPendingCwd: (panelId, cwd) =>
    setState((state) => ({
      panels: state.panels.map((entry) =>
        entry.id === panelId && entry.pending ? { ...entry, pending: { cwd } } : entry,
      ),
    })),

  startPanelSession: async (panelId, cwd) => {
    const panel = getState().panels.find((entry) => entry.id === panelId)
    // Only a pending panel can be started, so a double submit (Enter held, or a
    // click landing after the keypress) can't spawn a second subprocess against
    // the same refId.
    if (!panel?.pending) return

    setState((state) => ({
      panels: state.panels.map((entry) =>
        entry.id === panelId ? { ...entry, cwd, pending: undefined } : entry,
      ),
    }))

    await useSessionStore.getState().openTabWithId(panel.refId, { cwd })
  },

  closePanel: async (panelId) => {
    const panel = getState().panels.find((entry) => entry.id === panelId)
    if (!panel) return

    setState((state) => {
      const layout = removePanel(state.layout, panelId)
      const panels = state.panels.filter((entry) => entry.id !== panelId)
      const remaining = collectPanelIds(layout)
      return {
        panels,
        layout,
        focusedPanelId:
          state.focusedPanelId === panelId
            ? (remaining[remaining.length - 1] ?? null)
            : state.focusedPanelId,
      }
    })

    if (panel.kind === 'session') {
      // A pre-start panel owns nothing: no tab, no subprocess, no persisted
      // entry. Calling closeTab would send session:close for an id the main
      // process has never heard of.
      if (!panel.pending) await useSessionStore.getState().closeTab(panel.refId)
    } else {
      await api['terminal:close']({ id: panel.refId })
    }
  },

  renamePanel: (panelId, title) =>
    setState((state) => ({
      panels: state.panels.map((entry) => (entry.id === panelId ? { ...entry, title } : entry)),
    })),

  setDragging: (panelId) => setState({ draggingPanelId: panelId }),

  dropPanel: (panelId, targetPanelId, position) => {
    if (panelId === targetPanelId) {
      setState({ draggingPanelId: null })
      return
    }

    setState((state) => ({
      layout:
        position === 'center'
          ? swapPanels(state.layout, panelId, targetPanelId)
          : movePanel(state.layout, panelId, targetPanelId, position),
      draggingPanelId: null,
      focusedPanelId: panelId,
    }))
  },

  resizeSplit: (splitId, ratio) =>
    setState((state) => ({ layout: setRatio(state.layout, splitId, ratio) })),

  balanceLayout: () => setState((state) => ({ layout: balance(state.layout) })),
}))

/** The focused panel, falling back to the first one so there's always a target. */
export function selectFocusedPanel(state: WorkspaceState): Panel | null {
  if (state.panels.length === 0) return null
  return state.panels.find((panel) => panel.id === state.focusedPanelId) ?? state.panels[0]!
}

/** A panel's 1-indexed position in visual order, for the header's number label. */
export function selectPanelNumber(panelId: string) {
  return (state: WorkspaceState): number => collectPanelIds(state.layout).indexOf(panelId) + 1
}
