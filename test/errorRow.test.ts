/**
 * The in-transcript error row.
 *
 * Rendered directly rather than driven through the app, because the states it
 * exists for can't be produced on demand: a session dying mid-conversation, or the
 * CLI failing to start. Those are the moments the UI most needs to behave, and
 * "we'll find out when it happens" is a poor plan for an error path.
 *
 * The distinction under test is retryable vs not. A failed *send* can be resent
 * verbatim, so it offers a button; a session that died can't be fixed by resending,
 * so offering one there would be a lie that costs another failure to discover.
 *
 * Run with `npm test`.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorRow } from '@/components/ErrorRow'
import { check, section } from './harness'

const render = (item: {
  id: string
  message: string
  fatal: boolean
  retryText?: string
}): string =>
  renderToStaticMarkup(
    createElement(ErrorRow, { item: { kind: 'error' as const, ...item }, onRetry: () => undefined }),
  )

section('ErrorRow')

const retryable = render({
  id: 'e1',
  message: 'This session has ended and cannot accept messages.',
  fatal: false,
  retryText: 'hello there',
})

check('shows the message verbatim', retryable.includes('cannot accept messages'))
check('offers Retry when the text can be resent', retryable.includes('Retry'))
check('marks itself with the danger colour', retryable.includes('bg-danger/10'), retryable)
check('the message is selectable, so it can be copied', retryable.includes('data-selectable'))

const fatal = render({ id: 'e2', message: 'Could not start the session.', fatal: true })

check('no Retry button when there is nothing to resend', !fatal.includes('Retry'))
check('still shows the message', fatal.includes('Could not start the session.'))
