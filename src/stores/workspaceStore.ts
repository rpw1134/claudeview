import { create } from 'zustand'
import { api } from '@/lib/api'
import { useSessionStore } from './sessionStore'

/**
 * The panel workspace: what's on screen, where, and which panel has the keyboard.
 *
 * ## Layouts are presets, not a free-form split tree
 *
 * A recursive split tree (drag any edge, nest arbitrarily) is more powerful and
 * much worse to use: every rearrangement becomes a pixel-dragging exercise, and
 * layouts drift into shapes you didn't intend. A fixed set of grid presets covers
 * the cases actually wanted here — halves, thirds, quadrants, six, eight — and
 * makes switching a single click with a predictable result.
 *
 * ## Panels reference, they don't own
 *
 * A panel holds an id pointing at a session tab or a terminal, never the state
 * itself. That keeps sessions alive when a panel is moved or the layout changes,
 * and means the existing session store needs no knowledge of panels at all.
 */

export type PanelKind = 'session' | 'terminal'

export type Panel = {
  id: string
  kind: PanelKind
  /** Session tab id, or terminal id. */
  refId: string
  /** Shown in the panel header. */
  title: string
  cwd?: string
}

export type LayoutId = 'single' | 'columns-2' | 'rows-2' | 'columns-3' | 'grid-4' | 'grid-6' | 'grid-8'

export type LayoutSpec = {
  id: LayoutId
  label: string
  slots: number
  /** Tailwind-free inline grid template, applied directly to the container. */
  columns: string
  rows: string
}

export const LAYOUTS: readonly LayoutSpec[] = [
  { id: 'single', label: 'Single', slots: 1, columns: '1fr', rows: '1fr' },
  { id: 'columns-2', label: 'Side by side', slots: 2, columns: '1fr 1fr', rows: '1fr' },
  { id: 'rows-2', label: 'Stacked', slots: 2, columns: '1fr', rows: '1fr 1fr' },
  { id: 'columns-3', label: 'Three columns', slots: 3, columns: '1fr 1fr 1fr', rows: '1fr' },
  { id: 'grid-4', label: 'Quadrants', slots: 4, columns: '1fr 1fr', rows: '1fr 1fr' },
  { id: 'grid-6', label: 'Six', slots: 6, columns: '1fr 1fr 1fr', rows: '1fr 1fr' },
  { id: 'grid-8', label: 'Eight', slots: 8, columns: '1fr 1fr 1fr 1fr', rows: '1fr 1fr' },
] as const

export function layoutSpec(id: LayoutId): LayoutSpec {
  return LAYOUTS.find((entry) => entry.id === id) ?? LAYOUTS[0]!
}

type WorkspaceState = {
  layout: LayoutId
  panels: Panel[]
  focusedPanelId: string | null

  setLayout: (layout: LayoutId) => void
  focusPanel: (panelId: string) => void
  /** Add a panel, growing the layout if the current one is full. */
  addPanel: (kind: PanelKind, options?: { cwd?: string; resume?: string; title?: string }) => Promise<void>
  closePanel: (panelId: string) => Promise<void>
  renamePanel: (panelId: string, title: string) => void
}

const newId = (): string => crypto.randomUUID()

/** Smallest layout that fits `count` panels. */
function layoutFor(count: number): LayoutId {
  return (LAYOUTS.find((spec) => spec.slots >= count) ?? LAYOUTS[LAYOUTS.length - 1]!).id
}

export const MAX_PANELS = 8

export const useWorkspaceStore = create<WorkspaceState>()((setState, getState) => ({
  layout: 'single',
  panels: [],
  focusedPanelId: null,

  setLayout: (layout) => setState({ layout }),

  focusPanel: (panelId) => setState({ focusedPanelId: panelId }),

  addPanel: async (kind, options = {}) => {
    const { panels } = getState()
    if (panels.length >= MAX_PANELS) return

    const panelId = newId()
    const refId = newId()

    const panel: Panel = {
      id: panelId,
      kind,
      refId,
      title: options.title ?? (kind === 'terminal' ? 'Terminal' : 'New session'),
      cwd: options.cwd,
    }

    setState((state) => ({
      panels: [...state.panels, panel],
      // Grow the layout to fit rather than hiding the panel that was just added.
      layout: layoutFor(state.panels.length + 1),
      focusedPanelId: panelId,
    }))

    if (kind === 'session') {
      await useSessionStore.getState().openTabWithId(refId, {
        cwd: options.cwd,
        resume: options.resume,
        title: options.title,
      })
    } else {
      // Terminals are created lazily by the panel component, which knows the
      // pixel size and therefore the correct initial cols/rows. Creating one here
      // with a guessed 80x24 makes the first paint reflow visibly.
    }
  },

  closePanel: async (panelId) => {
    const panel = getState().panels.find((entry) => entry.id === panelId)
    if (!panel) return

    setState((state) => {
      const panels = state.panels.filter((entry) => entry.id !== panelId)
      return {
        panels,
        layout: layoutFor(Math.max(1, panels.length)),
        focusedPanelId:
          state.focusedPanelId === panelId ? (panels[panels.length - 1]?.id ?? null) : state.focusedPanelId,
      }
    })

    if (panel.kind === 'session') {
      await useSessionStore.getState().closeTab(panel.refId)
    } else {
      await api['terminal:close']({ id: panel.refId })
    }
  },

  renamePanel: (panelId, title) =>
    setState((state) => ({
      panels: state.panels.map((entry) => (entry.id === panelId ? { ...entry, title } : entry)),
    })),
}))

/** The focused panel, or the only panel when nothing is explicitly focused. */
export function selectFocusedPanel(state: WorkspaceState): Panel | null {
  if (state.panels.length === 0) return null
  return state.panels.find((panel) => panel.id === state.focusedPanelId) ?? state.panels[0]!
}
