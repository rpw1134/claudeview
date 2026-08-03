/**
 * The layout as a binary split tree.
 *
 * Replaces the fixed presets. A tree of nested splits gives arbitrary
 * arrangements, always fills the viewport exactly (every split divides 100% of its
 * parent), and supports both "drop a panel here" and "drag this divider" with the
 * same structure. Presets could only ever offer the shapes someone predicted.
 *
 *   split(row, 0.5)
 *   ├── leaf(panel-a)
 *   └── split(column, 0.6)
 *       ├── leaf(panel-b)
 *       └── leaf(panel-c)
 *
 * Every operation here is **pure** — each returns a new tree. Layout edits happen
 * during drags, several times a second, and in-place mutation would make React
 * miss updates and make an undo stack impossible to add later.
 */

export type SplitDirection = 'row' | 'column'

export type LeafNode = { id: string; type: 'leaf'; panelId: string }

export type SplitNode = {
  id: string
  type: 'split'
  direction: SplitDirection
  /** Fraction of the split taken by the first child, 0..1. */
  ratio: number
  children: [LayoutNode, LayoutNode]
}

export type LayoutNode = LeafNode | SplitNode

/** Where a dragged panel lands relative to the panel it was dropped on. */
export type DropPosition = 'left' | 'right' | 'top' | 'bottom' | 'center'

/** Keeps a pane from being dragged down to an unusable sliver. */
export const MIN_RATIO = 0.12
export const MAX_RATIO = 1 - MIN_RATIO

const newId = (): string => crypto.randomUUID()

export function leaf(panelId: string): LeafNode {
  return { id: newId(), type: 'leaf', panelId }
}

export function findLeaf(node: LayoutNode | null, panelId: string): LeafNode | null {
  if (!node) return null
  if (node.type === 'leaf') return node.panelId === panelId ? node : null
  return findLeaf(node.children[0], panelId) ?? findLeaf(node.children[1], panelId)
}

/** Panel ids in visual order (left-to-right, top-to-bottom). */
export function collectPanelIds(node: LayoutNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.panelId]
  return [...collectPanelIds(node.children[0]), ...collectPanelIds(node.children[1])]
}

/**
 * Insert `panelId` next to `targetPanelId`.
 *
 * The target leaf becomes a split containing itself and the new panel, ordered so
 * the new one lands on the side the user dropped toward.
 */
export function insertPanel(
  node: LayoutNode | null,
  targetPanelId: string,
  panelId: string,
  position: Exclude<DropPosition, 'center'>,
): LayoutNode {
  if (!node) return leaf(panelId)

  if (node.type === 'leaf') {
    if (node.panelId !== targetPanelId) return node

    const incoming = leaf(panelId)
    const direction: SplitDirection = position === 'left' || position === 'right' ? 'row' : 'column'
    const newFirst = position === 'left' || position === 'top'

    return {
      id: newId(),
      type: 'split',
      direction,
      ratio: 0.5,
      children: newFirst ? [incoming, node] : [node, incoming],
    }
  }

  return {
    ...node,
    children: [
      insertPanel(node.children[0], targetPanelId, panelId, position),
      insertPanel(node.children[1], targetPanelId, panelId, position),
    ],
  }
}

/**
 * Remove a panel, collapsing its split so the sibling takes the parent's place.
 *
 * Without the collapse the tree would accumulate splits with one empty side and
 * the remaining panel would render at half size with dead space beside it.
 */
export function removePanel(node: LayoutNode | null, panelId: string): LayoutNode | null {
  if (!node) return null
  if (node.type === 'leaf') return node.panelId === panelId ? null : node

  const first = removePanel(node.children[0], panelId)
  const second = removePanel(node.children[1], panelId)

  if (!first) return second
  if (!second) return first
  if (first === node.children[0] && second === node.children[1]) return node

  return { ...node, children: [first, second] }
}

/** Move an existing panel: remove it, then re-insert at the drop target. */
export function movePanel(
  node: LayoutNode | null,
  panelId: string,
  targetPanelId: string,
  position: Exclude<DropPosition, 'center'>,
): LayoutNode | null {
  if (panelId === targetPanelId) return node

  const without = removePanel(node, panelId)
  if (!without) return leaf(panelId)
  // The target must still exist after removal — it does, since a panel can't be
  // dropped onto itself and removal only collapses the dragged panel's own split.
  return insertPanel(without, targetPanelId, panelId, position)
}

/** Exchange two panels' positions, leaving the tree shape untouched. */
export function swapPanels(node: LayoutNode | null, a: string, b: string): LayoutNode | null {
  if (!node || a === b) return node
  if (node.type === 'leaf') {
    if (node.panelId === a) return { ...node, panelId: b }
    if (node.panelId === b) return { ...node, panelId: a }
    return node
  }
  return {
    ...node,
    children: [swapPanels(node.children[0], a, b)!, swapPanels(node.children[1], a, b)!],
  }
}

export function setRatio(node: LayoutNode | null, splitId: string, ratio: number): LayoutNode | null {
  if (!node || node.type === 'leaf') return node
  if (node.id === splitId) {
    return { ...node, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) }
  }
  return {
    ...node,
    children: [
      setRatio(node.children[0], splitId, ratio)!,
      setRatio(node.children[1], splitId, ratio)!,
    ],
  }
}

/** Reset every split to an even share. */
export function balance(node: LayoutNode | null): LayoutNode | null {
  if (!node || node.type === 'leaf') return node
  return {
    ...node,
    ratio: 0.5,
    children: [balance(node.children[0])!, balance(node.children[1])!],
  }
}

/**
 * Which region of a panel a pointer is over.
 *
 * Edge bands split; the middle swaps. The band is a fraction of the *smaller*
 * dimension so the zones stay reachable in a short-and-wide or tall-and-narrow
 * panel, where a fixed fraction of each axis would make one pair of edges tiny.
 */
export function dropPositionFor(rect: DOMRect, clientX: number, clientY: number): DropPosition {
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height

  const band = 0.3
  const distances: [DropPosition, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ]
  const [closest, distance] = distances.reduce((best, entry) =>
    entry[1] < best[1] ? entry : best,
  )

  return distance < band ? closest : 'center'
}

/** Preview rectangle for a drop indicator, in the target panel's local space. */
export function dropPreviewStyle(position: DropPosition): React.CSSProperties {
  switch (position) {
    case 'left':
      return { left: 0, top: 0, width: '50%', height: '100%' }
    case 'right':
      return { left: '50%', top: 0, width: '50%', height: '100%' }
    case 'top':
      return { left: 0, top: 0, width: '100%', height: '50%' }
    case 'bottom':
      return { left: 0, top: '50%', width: '100%', height: '50%' }
    case 'center':
      return { left: 0, top: 0, width: '100%', height: '100%' }
  }
}
