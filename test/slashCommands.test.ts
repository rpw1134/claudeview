/**
 * Slash-command completion rules.
 *
 * The cases worth pinning are the ones where the popup must *not* appear — a slash
 * mid-sentence, a caret that has moved past the command into its arguments — since
 * a false positive there hijacks Enter while someone is writing an ordinary
 * message, and that is the failure nobody forgives.
 *
 * Run with `npm test`.
 */
import { activeSlashToken, applySlashCommand, matchSlashCommands } from '@/lib/slashCommands'
import { check, section } from './harness'

section('activeSlashToken')

check('a bare slash is a token', activeSlashToken('/', 1)?.query === '')
check('a partial command is a token', activeSlashToken('/us', 3)?.query === 'us')
check('the token ends at the first space', activeSlashToken('/usage now', 4)?.end === 6)
check('a caret inside the token still counts', activeSlashToken('/usage', 2)?.query === 'usage')

check('plain text is not a token', activeSlashToken('hello', 5) === null)
check('a slash mid-sentence is not a token', activeSlashToken('see /usage', 10) === null)
check(
  'a caret past the token is not a token',
  activeSlashToken('/usage now', 8) === null,
  JSON.stringify(activeSlashToken('/usage now', 8)),
)
check('a newline ends the token too', activeSlashToken('/usage\nmore', 9) === null)

section('matchSlashCommands')

const COMMANDS = ['usage', 'compact', 'review', 'config']

check('an empty query matches everything', matchSlashCommands(COMMANDS, '').length === 4)
check(
  'a prefix narrows the set',
  JSON.stringify(matchSlashCommands(COMMANDS, 'co')) === JSON.stringify(['compact', 'config']),
)
check('matching ignores case', matchSlashCommands(COMMANDS, 'US')[0] === 'usage')
check('a non-prefix substring does not match', matchSlashCommands(COMMANDS, 'sage').length === 0)
check('no match yields an empty list', matchSlashCommands(COMMANDS, 'zz').length === 0)

section('applySlashCommand')

const accept = (draft: string, name: string) =>
  applySlashCommand(draft, activeSlashToken(draft, draft.length)!, name)

check(
  'accepting leaves a trailing space',
  accept('/us', 'usage').text === '/usage ',
  JSON.stringify(accept('/us', 'usage').text),
)
check('the caret lands after the space', accept('/us', 'usage').caret === 7)
check(
  'existing arguments survive without doubling the space',
  applySlashCommand('/us args', activeSlashToken('/us args', 3)!, 'usage').text === '/usage args',
  applySlashCommand('/us args', activeSlashToken('/us args', 3)!, 'usage').text,
)
check(
  'a following line is preserved',
  applySlashCommand('/us\nline', activeSlashToken('/us\nline', 3)!, 'usage').text ===
    '/usage \nline',
)
