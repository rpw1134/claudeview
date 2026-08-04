/**
 * Attachment composition.
 *
 * The failure modes here are quiet ones: a path with a space silently attaching the
 * wrong file, an attachment-only message sending a leading blank line, the same file
 * appearing twice after a double drop. None of them throw, and none are obvious from
 * looking at the composer — which is exactly why they're worth pinning down.
 *
 * Run with `npm test`.
 */
import { basename, composeMessage, mergeAttachments } from '@/lib/attachments'
import { check, section } from './harness'

section('composeMessage')

check('no attachments passes text through', composeMessage('hello', []) === 'hello')

check(
  'a plain path becomes an @ mention',
  composeMessage('look', ['/a/b.ts']) === 'look\n\nAttached:\n- @/a/b.ts',
  JSON.stringify(composeMessage('look', ['/a/b.ts'])),
)

check(
  'a path with a space is quoted, not mentioned',
  composeMessage('look', ['/a/my file.ts']) === 'look\n\nAttached:\n- `/a/my file.ts`',
  JSON.stringify(composeMessage('look', ['/a/my file.ts'])),
)

check(
  'attachment-only message has no leading blank line',
  composeMessage('', ['/a/b.ts']) === 'Attached:\n- @/a/b.ts',
  JSON.stringify(composeMessage('', ['/a/b.ts'])),
)

check(
  'several attachments are one per line',
  composeMessage('', ['/a', '/b']) === 'Attached:\n- @/a\n- @/b',
  JSON.stringify(composeMessage('', ['/a', '/b'])),
)

section('mergeAttachments')

check('adds to an empty list', mergeAttachments([], ['/a'], 5).join() === '/a')
check('de-duplicates a repeated drop', mergeAttachments(['/a'], ['/a'], 5).length === 1)
check('keeps order, appending new paths', mergeAttachments(['/a'], ['/b'], 5).join() === '/a,/b')
check(
  'de-duplicates within a single batch',
  mergeAttachments([], ['/a', '/a', '/b'], 5).join() === '/a,/b',
)
check('caps at the limit', mergeAttachments(['/a', '/b'], ['/c', '/d'], 3).length === 3)

section('basename')

check('file', basename('/a/b/c.ts') === 'c.ts')
check('directory with a trailing slash', basename('/a/b/') === 'b')
check('bare name', basename('c.ts') === 'c.ts')
