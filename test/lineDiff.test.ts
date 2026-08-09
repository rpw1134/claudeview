/**
 * Line-diff invariants.
 *
 * The properties that matter to the review gutter: marks are stated in the
 * CURRENT file's 1-indexed line numbers, an unchanged file produces none, and a
 * missing baseline means the whole file is new. The prefix/suffix algorithm is
 * deliberately coarse in the middle (see shared/lineDiff.ts), so these check the
 * boundaries — where it must be exact — rather than the granularity of the middle.
 *
 * Run with `npm test`.
 */
import { lineDiff } from '@shared/lineDiff'
import type { ReviewLineMark } from '@shared/ipc'

import { check, section } from './harness'

const show = (marks: ReviewLineMark[]) => JSON.stringify(marks)
const lines = (...values: string[]) => values.join('\n')

section('identical / empty')
check('identical files produce no marks', show(lineDiff(lines('a', 'b', 'c'), lines('a', 'b', 'c'))) === '[]')
check('empty baseline and empty current', show(lineDiff('', '')) === '[]')
check(
  'empty current after a real baseline',
  show(lineDiff(lines('a', 'b'), '')) === '[]',
  show(lineDiff(lines('a', 'b'), '')),
)
check(
  'trailing newline alone is not a change',
  show(lineDiff('a\nb', 'a\nb\n')) === '[]',
  show(lineDiff('a\nb', 'a\nb\n')),
)

section('baseline null')
check(
  'created file marks every line added',
  show(lineDiff(null, lines('a', 'b', 'c'))) === show([{ start: 1, count: 3, kind: 'added' }]),
  show(lineDiff(null, lines('a', 'b', 'c'))),
)
check('created empty file has no marks', show(lineDiff(null, '')) === '[]')

section('additions')
{
  const marks = lineDiff(lines('a', 'b'), lines('a', 'b', 'c', 'd'))
  check(
    'appended lines start after the common prefix',
    show(marks) === show([{ start: 3, count: 2, kind: 'added' }]),
    show(marks),
  )
}
{
  const marks = lineDiff(lines('c', 'd'), lines('a', 'b', 'c', 'd'))
  check(
    'prepended lines mark the head of the current file',
    show(marks) === show([{ start: 1, count: 2, kind: 'added' }]),
    show(marks),
  )
}
{
  const marks = lineDiff(lines('a', 'd'), lines('a', 'b', 'c', 'd'))
  check(
    'insertion between unchanged lines is bounded by both',
    show(marks) === show([{ start: 2, count: 2, kind: 'added' }]),
    show(marks),
  )
}

section('modifications')
{
  const marks = lineDiff(lines('a', 'b', 'c'), lines('a', 'B', 'c'))
  check(
    'a changed middle line is modified, not added',
    show(marks) === show([{ start: 2, count: 1, kind: 'modified' }]),
    show(marks),
  )
}
{
  // One line replaced by three: the overlap is a rewrite, the surplus is new.
  const marks = lineDiff(lines('a', 'b', 'z'), lines('a', 'x', 'y', 'w', 'z'))
  check(
    'grown region splits into modified then added',
    show(marks) ===
      show([
        { start: 2, count: 1, kind: 'modified' },
        { start: 3, count: 2, kind: 'added' },
      ]),
    show(marks),
  )
}
{
  const marks = lineDiff(lines('a', 'b', 'c', 'd'), lines('a', 'X', 'd'))
  check(
    'shrunk region reports only surviving lines',
    show(marks) === show([{ start: 2, count: 1, kind: 'modified' }]),
    show(marks),
  )
}
{
  // Repeated lines are where a naive prefix+suffix scan double-counts.
  const marks = lineDiff(lines('x', 'x'), lines('x', 'x', 'x'))
  check(
    'repeated lines are not counted by both scans',
    show(marks) === show([{ start: 3, count: 1, kind: 'added' }]),
    show(marks),
  )
}

section('deletion')
check(
  'pure deletion leaves nothing to mark',
  show(lineDiff(lines('a', 'b', 'c'), lines('a', 'c'))) === '[]',
  show(lineDiff(lines('a', 'b', 'c'), lines('a', 'c'))),
)
