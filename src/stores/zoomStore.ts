import { create } from 'zustand'

/**
 * Per-panel zoom, driven by ⌘+ / ⌘- / ⌘0 on the focused panel.
 *
 * Zoom is a property of a PANEL, not the window: eight panels at once means
 * eight different documents at different reading distances — a dense log in one,
 * a diagram in another — and a window-level zoom (Electron's default menu roles)
 * scales all of them together, which helps none of them. The appearance slider
 * (⌘,) remains the app-wide baseline; this multiplies on top of it, per panel.
 *
 * Applied as the CSS `zoom` property on the panel's frame (see PanelMosaic):
 * unlike a font-size override it scales everything layout-participating —
 * SVGs, diagrams, gutters — which is exactly what "make this panel bigger"
 * means. Not persisted: zoom is a reading posture, not a setting.
 */

const MIN_ZOOM = 0.6
const MAX_ZOOM = 1.6
const STEP = 0.1

type ZoomState = {
  /** panelId -> factor. Absent means 1. */
  zoom: Record<string, number>

  zoomIn: (panelId: string) => void
  zoomOut: (panelId: string) => void
  resetZoom: (panelId: string) => void
  /** Drop a closed panel's entry so the map doesn't grow forever. */
  forget: (panelId: string) => void
}

const clamp = (value: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10))

export const useZoomStore = create<ZoomState>()((setState) => ({
  zoom: {},

  zoomIn: (panelId) =>
    setState((state) => ({
      zoom: { ...state.zoom, [panelId]: clamp((state.zoom[panelId] ?? 1) + STEP) },
    })),

  zoomOut: (panelId) =>
    setState((state) => ({
      zoom: { ...state.zoom, [panelId]: clamp((state.zoom[panelId] ?? 1) - STEP) },
    })),

  resetZoom: (panelId) =>
    setState((state) => {
      if (state.zoom[panelId] === undefined) return state
      const next = { ...state.zoom }
      delete next[panelId]
      return { zoom: next }
    }),

  forget: (panelId) =>
    setState((state) => {
      if (state.zoom[panelId] === undefined) return state
      const next = { ...state.zoom }
      delete next[panelId]
      return { zoom: next }
    }),
}))
