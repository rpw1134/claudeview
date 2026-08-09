/**
 * A line-level diff sized for "show me what changed in this file", not for
 * producing a patch.
 *
 * ## Why not Myers
 *
 * The consumer is a review gutter: it colours lines in the *current* file so a
 * human can find the edit. It never has to reconstruct the baseline, never emits
 * a hunk header, and never round-trips through `patch`. Myers (or a
 * histogram/patience variant) buys minimal-edit-script fidelity — correctly
 * splitting an interleaved change into several small runs — at the cost of an
 * O(ND) implementation with its own snake bookkeeping and pathological cases on
 * large, low-similarity files.
 *
 * So this does the pragmatic thing instead: strip the identical prefix and
 * suffix, and call the remaining middle one change. The tradeoff is bounded and
 * predictable — an edit that touches line 10 and line 900 of a 1000-line file is
 * reported as one 891-line run rather than two small ones. Over-reporting inside
 * a region the user is already being pointed at is a far cheaper failure than a
 * subtle bug in a hand-rolled Myers, and the cost is linear in file length.
 *
 * If per-hunk precision is ever needed, this is the single function to replace;
 * nothing else knows how the marks were derived.
 */
import type { ReviewLineMark } from './ipc'

/**
 * Marks describing how `current` differs from `baseline`, in `current`'s own
 * 1-indexed line numbers.
 *
 * `baseline === null` means the file did not exist before, so the whole thing is
 * new. Pure deletions produce no marks: there is no line left in `current` to
 * point at, and the file-level view already reports the size change.
 */
export function lineDiff(baseline: string | null, current: string): ReviewLineMark[] {
  const currentLines = splitLines(current)
  if (currentLines.length === 0) return []

  if (baseline === null) {
    return [{ start: 1, count: currentLines.length, kind: 'added' }]
  }

  const baseLines = splitLines(baseline)

  let prefix = 0
  while (
    prefix < baseLines.length &&
    prefix < currentLines.length &&
    baseLines[prefix] === currentLines[prefix]
  ) {
    prefix += 1
  }

  // Suffix scan stops at the prefix on both sides so the two regions can never
  // overlap — otherwise a file of repeated identical lines double-counts them.
  let suffix = 0
  while (
    suffix < baseLines.length - prefix &&
    suffix < currentLines.length - prefix &&
    baseLines[baseLines.length - 1 - suffix] === currentLines[currentLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const baseMiddle = baseLines.length - prefix - suffix
  const currentMiddle = currentLines.length - prefix - suffix

  if (currentMiddle === 0) return []

  const marks: ReviewLineMark[] = []
  const modified = Math.min(baseMiddle, currentMiddle)

  if (modified > 0) {
    marks.push({ start: prefix + 1, count: modified, kind: 'modified' })
  }
  if (currentMiddle > modified) {
    marks.push({
      start: prefix + modified + 1,
      count: currentMiddle - modified,
      kind: 'added',
    })
  }

  return marks
}

/**
 * Split into lines the way an editor numbers them.
 *
 * A single trailing newline is a terminator, not an empty final line — keeping it
 * would make every file report one phantom line past its end, and would flag a
 * change whenever a tool adds or drops the final newline. `\r\n` is normalized so
 * a line-ending-only rewrite doesn't paint the entire file as modified.
 */
function splitLines(text: string): string[] {
  if (text === '') return []
  const normalized = text.replace(/\r\n/g, '\n')
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  return body.split('\n')
}
