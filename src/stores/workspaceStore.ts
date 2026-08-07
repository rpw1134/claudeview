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

export type PanelKind = 'session' | 'terminal' | 'config'

export type Panel = {
  id: string
  kind: PanelKind
  /** Session tab id, or terminal id. */
  refId: string
  title: string
  cwd?: string
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
   * Focus a panel. `viaKeyboard` additionally bumps `autoFocusToken`, which is what
   * moves the caret into that panel's input — pointer focus deliberately does not,
   * or clicking into a transcript to select text would yank the caret away.
   */
  focusPanel: (panelId: string, viaKeyboard?: boolean) => void
  /** Move focus to the next/previous panel in visual order. */
  cyclePanel: (delta: 1 | -1) => void
  addPanel: (
    kind: PanelKind,
    options?: { cwd?: string; resume?: string; title?: string; direction?: SplitDirection },
  ) => Promise<void>
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

    const panel: Panel = {
      id: panelId,
      kind,
      refId,
      title:
        options.title ??
        (kind === 'terminal' ? 'Terminal' : kind === 'config' ? 'Claude config' : 'New session'),
      cwd: options.cwd,
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

    if (kind === 'session') {
      await useSessionStore.getState().openTabWithId(refId, {
        cwd: options.cwd,
        resume: options.resume,
        title: options.title,
      })
    }
    // Terminals are created by the panel component, which knows its pixel size and
    // can therefore spawn the PTY at the right cols/rows the first time.
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
      await useSessionStore.getState().closeTab(panel.refId)
    } else if (panel.kind === 'terminal') {
      await api['terminal:close']({ id: panel.refId })
    }
    // Config panels hold no process; there is nothing to dispose.
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
