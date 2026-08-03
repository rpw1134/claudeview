import { useCallback, useRef, useState } from 'react'
import type { Panel } from '@/stores/workspaceStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  dropPositionFor,
  dropPreviewStyle,
  MAX_RATIO,
  MIN_RATIO,
  type DropPosition,
  type LayoutNode,
  type SplitNode,
} from '@/lib/layoutTree'
import { PanelFrame } from './PanelFrame'
import { cn } from '@/lib/utils'

/** Live drag state, kept outside React so pointer moves don't re-render the tree. */
type DragState = {
  panelId: string
  targetPanelId: string | null
  position: DropPosition | null
}

/**
 * Renders the layout tree, and owns both drag interactions.
 *
 * ## Why pointer events rather than HTML5 drag-and-drop
 *
 * HTML5 DnD gives you a browser-drawn ghost image you can't style, coarse
 * `dragover` throttling, and no reliable coordinates over child elements. Panels
 * need a precise drop indicator that follows the cursor across nested containers,
 * so this uses pointer events with capture: one pointer-down on a panel header
 * captures the pointer, and every move hit-tests the panel under the cursor.
 *
 * ## Drop zones
 *
 * Hovering the outer third of a panel splits it on that side; the middle swaps the
 * two panels. Both show a translucent preview of exactly the space the panel will
 * occupy, so the result is visible before committing.
 */
export function PanelMosaic({
  panels,
  layout,
  focusedPanelId,
  autoFocusToken,
  home,
  onFocus,
  onClose,
}: {
  panels: Panel[]
  layout: LayoutNode | null
  focusedPanelId: string | null
  autoFocusToken: number
  home?: string
  onFocus: (panelId: string) => void
  onClose: (panelId: string) => void
}) {
  const dropPanel = useWorkspaceStore((state) => state.dropPanel)
  const setDragging = useWorkspaceStore((state) => state.setDragging)
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit)

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const panelById = new Map(panels.map((panel) => [panel.id, panel]))

  /** Begin dragging a panel by its header. */
  const startDrag = useCallback(
    (panelId: string, event: React.PointerEvent) => {
      // Ignore anything but a primary-button drag, so right-click and the close
      // button don't start one.
      if (event.button !== 0) return

      const origin = { x: event.clientX, y: event.clientY }
      const element = event.currentTarget as HTMLElement
      let started = false

      const onMove = (moveEvent: PointerEvent) => {
        // A few pixels of slop, so a click on the header stays a click.
        if (!started) {
          const moved =
            Math.abs(moveEvent.clientX - origin.x) + Math.abs(moveEvent.clientY - origin.y)
          if (moved < 6) return
          started = true
          element.setPointerCapture(moveEvent.pointerId)
          setDragging(panelId)
        }

        // Hit-test whatever panel is under the cursor. `elementFromPoint` is used
        // rather than pointer events on the targets because the captured pointer
        // delivers all moves to the source element.
        const under = document
          .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
          ?.closest('[data-panel-id]') as HTMLElement | null

        const targetPanelId = under?.dataset.panelId ?? null
        let position: DropPosition | null = null
        if (under && targetPanelId && targetPanelId !== panelId) {
          position = dropPositionFor(under.getBoundingClientRect(), moveEvent.clientX, moveEvent.clientY)
        }

        const next = { panelId, targetPanelId, position }
        dragRef.current = next
        setDrag(next)
      }

      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        try {
          element.releasePointerCapture(upEvent.pointerId)
        } catch {
          // Capture may never have been taken if the drag didn't pass the threshold.
        }

        const current = dragRef.current
        dragRef.current = null
        setDrag(null)
        setDragging(null)

        if (started && current?.targetPanelId && current.position) {
          dropPanel(panelId, current.targetPanelId, current.position)
        } else if (!started) {
          onFocus(panelId)
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [dropPanel, setDragging, onFocus],
  )

  if (!layout) return <div className="min-h-0 flex-1" />

  return (
    <div
      data-mosaic-root
      // `flex` is load-bearing: the layout tree's root child sizes itself with
      // `flex-1`, which only does anything inside a flex container. As a plain
      // block this took content height and left dead space below the panels.
      className="relative flex min-h-0 flex-1 p-2"
    >
      <LayoutBranch
        node={layout}
        panelById={panelById}
        focusedPanelId={focusedPanelId}
        autoFocusToken={autoFocusToken}
        home={home}
        drag={drag}
        onFocus={onFocus}
        onClose={onClose}
        onStartDrag={startDrag}
        onResize={resizeSplit}
      />
    </div>
  )
}

function LayoutBranch({
  node,
  panelById,
  focusedPanelId,
  autoFocusToken,
  home,
  drag,
  onFocus,
  onClose,
  onStartDrag,
  onResize,
}: {
  node: LayoutNode
  panelById: Map<string, Panel>
  focusedPanelId: string | null
  autoFocusToken: number
  home?: string
  drag: DragState | null
  onFocus: (panelId: string) => void
  onClose: (panelId: string) => void
  onStartDrag: (panelId: string, event: React.PointerEvent) => void
  onResize: (splitId: string, ratio: number) => void
}) {
  if (node.type === 'leaf') {
    const panel = panelById.get(node.panelId)
    if (!panel) return null

    const isDropTarget = drag?.targetPanelId === panel.id && drag.position !== null

    return (
      <div
        data-panel-id={panel.id}
        className={cn(
          'relative min-h-0 min-w-0 flex-1',
          drag?.panelId === panel.id && 'opacity-40',
        )}
      >
        <PanelFrame
          panel={panel}
          focused={panel.id === focusedPanelId}
          autoFocusToken={autoFocusToken}
          home={home}
          onFocus={() => onFocus(panel.id)}
          onClose={() => onClose(panel.id)}
          onHeaderPointerDown={(event) => onStartDrag(panel.id, event)}
        />

        {isDropTarget ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 rounded-lg p-1"
            aria-hidden
          >
            <div
              className="absolute rounded-md border-2 border-accent bg-accent/20 transition-all duration-75"
              style={dropPreviewStyle(drag.position!)}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return <Split node={node} onResize={onResize}>
    <LayoutBranch
      node={node.children[0]}
      panelById={panelById}
      focusedPanelId={focusedPanelId}
      autoFocusToken={autoFocusToken}
      home={home}
      drag={drag}
      onFocus={onFocus}
      onClose={onClose}
      onStartDrag={onStartDrag}
      onResize={onResize}
    />
    <LayoutBranch
      node={node.children[1]}
      panelById={panelById}
      focusedPanelId={focusedPanelId}
      autoFocusToken={autoFocusToken}
      home={home}
      drag={drag}
      onFocus={onFocus}
      onClose={onClose}
      onStartDrag={onStartDrag}
      onResize={onResize}
    />
  </Split>
}

/**
 * One split, with a draggable divider.
 *
 * The ratio is written straight to the DOM during the drag and only committed to
 * the store on release. Routing every pointer move through React state would
 * re-render both subtrees — including live transcripts and terminal emulators —
 * at pointer frequency, which makes the divider feel heavy.
 */
function Split({
  node,
  onResize,
  children,
}: {
  node: SplitNode
  onResize: (splitId: string, ratio: number) => void
  children: [React.ReactNode, React.ReactNode]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLDivElement>(null)
  const secondRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const isRow = node.direction === 'row'

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      const container = containerRef.current
      if (!container) return

      const divider = event.currentTarget as HTMLElement
      divider.setPointerCapture(event.pointerId)
      setDragging(true)
      let ratio = node.ratio

      const onMove = (moveEvent: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        const raw = isRow
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height

        ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, raw))
        if (firstRef.current) firstRef.current.style.flexGrow = String(ratio)
        if (secondRef.current) secondRef.current.style.flexGrow = String(1 - ratio)
      }

      const onUp = (upEvent: PointerEvent) => {
        divider.removeEventListener('pointermove', onMove)
        divider.removeEventListener('pointerup', onUp)
        try {
          divider.releasePointerCapture(upEvent.pointerId)
        } catch {
          /* already released */
        }
        setDragging(false)
        onResize(node.id, ratio)
      }

      divider.addEventListener('pointermove', onMove)
      divider.addEventListener('pointerup', onUp)
    },
    [node.id, node.ratio, isRow, onResize],
  )

  return (
    <div
      ref={containerRef}
      className={cn('flex min-h-0 min-w-0 flex-1', isRow ? 'flex-row' : 'flex-col')}
    >
      <div ref={firstRef} className="flex min-h-0 min-w-0" style={{ flexGrow: node.ratio, flexBasis: 0 }}>
        {children[0]}
      </div>

      <div
        role="separator"
        aria-orientation={isRow ? 'vertical' : 'horizontal'}
        aria-label="Resize panels"
        onPointerDown={onPointerDown}
        className={cn(
          'group relative shrink-0',
          isRow ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize',
        )}
      >
        {/* A hairline that thickens on hover: a visible seam without a heavy
            divider bar taking up space between every pair of panels. */}
        <div
          className={cn(
            'absolute rounded-full transition-colors duration-100',
            isRow
              ? 'left-1/2 top-2 bottom-2 w-px -translate-x-1/2 group-hover:w-0.5'
              : 'top-1/2 left-2 right-2 h-px -translate-y-1/2 group-hover:h-0.5',
            dragging ? 'bg-accent' : 'bg-line group-hover:bg-accent',
          )}
        />
      </div>

      <div
        ref={secondRef}
        className="flex min-h-0 min-w-0"
        style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}
      >
        {children[1]}
      </div>
    </div>
  )
}
