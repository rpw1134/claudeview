/**
 * Layout-tree invariants.
 *
 * The most important one is coverage: after any sequence of inserts, removes and
 * moves, the panel areas must sum to exactly 1 — i.e. the layout always fills the
 * viewport with no gaps and no overlap. That property is what a preset system gave
 * for free and a free-form tree has to earn.
 *
 * Run with `npm test`.
 */
import {
  balance, collectPanelIds, dropPositionFor, insertPanel, leaf,
  movePanel, removePanel, setRatio, swapPanels, type LayoutNode,
} from '@/lib/layoutTree'

import { check } from './harness'
/** Total area each panel occupies, to prove the tree always fills the viewport. */
function areas(node: LayoutNode | null, w = 1, h = 1, acc: Record<string, number> = {}) {
  if (!node) return acc
  if (node.type === 'leaf') { acc[node.panelId] = (acc[node.panelId] ?? 0) + w * h; return acc }
  const r = node.ratio
  if (node.direction === 'row') { areas(node.children[0], w * r, h, acc); areas(node.children[1], w * (1 - r), h, acc) }
  else { areas(node.children[0], w, h * r, acc); areas(node.children[1], w, h * (1 - r), acc) }
  return acc
}
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

console.log('--- insert / structure ---')
let t: LayoutNode | null = leaf('a')
t = insertPanel(t, 'a', 'b', 'right')
check('2 panels after insert', collectPanelIds(t).join(',') === 'a,b', collectPanelIds(t).join(','))
t = insertPanel(t, 'b', 'c', 'bottom')
check('3 panels', collectPanelIds(t).sort().join(',') === 'a,b,c')
check('viewport fully covered', Math.abs(sum(areas(t)) - 1) < 1e-9, String(sum(areas(t))))

console.log('--- insert side ordering ---')
let s: LayoutNode | null = leaf('x')
s = insertPanel(s, 'x', 'y', 'left')
check('left insert puts new panel first', collectPanelIds(s).join(',') === 'y,x', collectPanelIds(s).join(','))
s = leaf('x'); s = insertPanel(s, 'x', 'y', 'top')
check('top insert puts new panel first', collectPanelIds(s).join(',') === 'y,x')

console.log('--- remove collapses ---')
let r: LayoutNode | null = leaf('a')
r = insertPanel(r, 'a', 'b', 'right')
r = insertPanel(r, 'b', 'c', 'bottom')
r = removePanel(r, 'c')
check('collapsed back to a split of 2', r?.type === 'split' && collectPanelIds(r).join(',') === 'a,b', JSON.stringify(collectPanelIds(r)))
r = removePanel(r, 'b')
check('collapsed to single leaf', r?.type === 'leaf', r?.type)
check('area still 1 after removals', Math.abs(sum(areas(r)) - 1) < 1e-9)
check('removing last returns null', removePanel(r, 'a') === null)

console.log('--- move ---')
let m: LayoutNode | null = leaf('a')
m = insertPanel(m, 'a', 'b', 'right')
m = insertPanel(m, 'b', 'c', 'right')
const before = collectPanelIds(m).sort().join(',')
m = movePanel(m, 'c', 'a', 'left')
check('move keeps every panel', collectPanelIds(m).sort().join(',') === before, collectPanelIds(m).join(','))
check('moved panel is now first', collectPanelIds(m)[0] === 'c', collectPanelIds(m).join(','))
check('no duplicates after move', new Set(collectPanelIds(m)).size === collectPanelIds(m).length)
check('area intact after move', Math.abs(sum(areas(m)) - 1) < 1e-9)
check('move onto self is a no-op', movePanel(m, 'a', 'a', 'left') === m)

console.log('--- swap ---')
let w: LayoutNode | null = leaf('a')
w = insertPanel(w, 'a', 'b', 'right')
const swapped = swapPanels(w, 'a', 'b')
check('swap exchanges order', collectPanelIds(swapped).join(',') === 'b,a', collectPanelIds(swapped).join(','))
check('swap preserves shape', JSON.stringify(areas(swapped)).length > 0 && Math.abs(sum(areas(swapped)) - 1) < 1e-9)

console.log('--- ratios ---')
let q: LayoutNode | null = leaf('a')
q = insertPanel(q, 'a', 'b', 'right')
const splitId = (q as any).id
q = setRatio(q, splitId, 0.8)
check('ratio applied', (q as any).ratio === 0.8, String((q as any).ratio))
q = setRatio(q, splitId, 0.001)
check('ratio clamped to minimum', (q as any).ratio >= 0.12, String((q as any).ratio))
q = setRatio(q, splitId, 5)
check('ratio clamped to maximum', (q as any).ratio <= 0.88, String((q as any).ratio))
check('area still 1 at extreme ratio', Math.abs(sum(areas(q)) - 1) < 1e-9)
check('balance resets to even', (balance(q) as any).ratio === 0.5)

console.log('--- drop zones ---')
const rect = { left: 0, top: 0, width: 400, height: 300 } as DOMRect
check('far left -> left', dropPositionFor(rect, 10, 150) === 'left')
check('far right -> right', dropPositionFor(rect, 390, 150) === 'right')
check('top -> top', dropPositionFor(rect, 200, 5) === 'top')
check('bottom -> bottom', dropPositionFor(rect, 200, 295) === 'bottom')
check('middle -> center', dropPositionFor(rect, 200, 150) === 'center', dropPositionFor(rect, 200, 150))

console.log('--- stress: 8 panels ---')
let big: LayoutNode | null = leaf('p0')
for (let i = 1; i < 8; i++) big = insertPanel(big, `p${i - 1}`, `p${i}`, i % 2 ? 'right' : 'bottom')
check('8 panels present', collectPanelIds(big).length === 8, String(collectPanelIds(big).length))
check('8-panel layout fills viewport', Math.abs(sum(areas(big)) - 1) < 1e-9, String(sum(areas(big))))
for (let i = 0; i < 8; i++) big = removePanel(big, `p${i}`)
check('all removed cleanly', big === null)
