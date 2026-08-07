/**
 * MessageNormalizer's delta/full-message de-duplication.
 *
 * The trap being pinned: the CLI re-emits each completed content block as its
 * own `assistant` message whose content array holds ONE entry, so the complete
 * block's index is always 0 while its deltas streamed under the API's real
 * block index. A dedup keyed by `messageId#index` therefore never matched, and
 * every streamed response was re-emitted in full when its complete message
 * arrived — the "response rendered twice" bug. The event sequence below is a
 * real captured CLI trace (thinking turn, summarized display).
 *
 * Run with `npm test`.
 */
import { MessageNormalizer } from '../electron/main/session/MessageNormalizer'
import { check, section } from './harness'

type AnyMessage = never

const streamEvent = (event: unknown): AnyMessage =>
  ({ type: 'stream_event', event, parent_tool_use_id: null }) as AnyMessage

const assistantMessage = (id: string, content: unknown[]): AnyMessage =>
  ({ type: 'assistant', uuid: `uuid-${id}`, parent_tool_use_id: null, message: { id, content } }) as AnyMessage

section('normalizer: streamed text is not re-emitted by its complete message')

{
  const normalizer = new MessageNormalizer()
  const events = [
    // Real CLI ordering: thinking arrives ONLY as a complete block (summarized
    // thinking streams no deltas), then the answer streams at block index 1,
    // then the answer's complete message arrives as a one-entry content array.
    ...normalizer.normalize(streamEvent({ type: 'message_start', message: { id: 'msg_A' } })),
    ...normalizer.normalize(assistantMessage('msg_A', [{ type: 'thinking', thinking: 'let me reason' }])),
    ...normalizer.normalize(
      streamEvent({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'hello ' } }),
    ),
    ...normalizer.normalize(
      streamEvent({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'world' } }),
    ),
    ...normalizer.normalize(streamEvent({ type: 'content_block_stop', index: 1 })),
    ...normalizer.normalize(assistantMessage('msg_A', [{ type: 'text', text: 'hello world' }])),
  ]

  const textDeltas = events.filter((event) => event.kind === 'text-delta')
  const thinkingDeltas = events.filter((event) => event.kind === 'thinking-delta')
  const totalText = textDeltas.reduce((sum, event) => sum + event.text.length, 0)

  check('text arrives exactly once', totalText === 'hello world'.length, `${totalText} chars`)
  check('thinking backfills exactly once', thinkingDeltas.length === 1)
  check(
    'streamed text keeps one block id',
    new Set(textDeltas.map((event) => event.blockId)).size === 1,
  )
  check(
    'backfilled thinking does not share the streamed block id',
    thinkingDeltas[0]!.blockId !== textDeltas[0]!.blockId,
  )
}

section('normalizer: backfill still works when nothing streamed')

{
  // Partials disabled (or replay): the complete message is the only copy, and
  // both blocks of one message must land in distinct buffers.
  const normalizer = new MessageNormalizer()
  const events = [
    ...normalizer.normalize(assistantMessage('msg_B', [{ type: 'thinking', thinking: 'hm' }])),
    ...normalizer.normalize(assistantMessage('msg_B', [{ type: 'text', text: 'answer' }])),
  ]

  const textDeltas = events.filter((event) => event.kind === 'text-delta')
  const thinkingDeltas = events.filter((event) => event.kind === 'thinking-delta')

  check('unstreamed text is emitted', textDeltas.length === 1 && textDeltas[0]!.text === 'answer')
  check('unstreamed thinking is emitted', thinkingDeltas.length === 1)
  check(
    'split-out blocks of one message get distinct ids',
    textDeltas[0]!.blockId !== thinkingDeltas[0]!.blockId,
  )
}

section('normalizer: dedup resets between turns')

{
  const normalizer = new MessageNormalizer()
  normalizer.normalize(streamEvent({ type: 'message_start', message: { id: 'msg_C' } }))
  normalizer.normalize(
    streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'turn one' } }),
  )
  normalizer.normalize({ type: 'result', subtype: 'success', is_error: false, result: 'ok' } as AnyMessage)

  // Next turn, partials absent: the complete message must not be treated as an echo.
  const events = normalizer.normalize(assistantMessage('msg_D', [{ type: 'text', text: 'turn two' }]))
  check(
    'a later turn backfills independently',
    events.some((event) => event.kind === 'text-delta' && event.text === 'turn two'),
  )
}
