import { CircleAlert, RotateCw } from 'lucide-react'
import type { TranscriptItem } from '@/types/session'
import { Button } from './ui/Button'

/**
 * A failure, in the flow of the conversation.
 *
 * ## Why it's an item and not a strip
 *
 * Errors used to be one `lastError` string rendered above the composer. That lost
 * two things: *which* message failed, and every error but the most recent. As a
 * transcript item it sits where it happened, in order, and a failed send can carry
 * the text that didn't go.
 *
 * ## Why it isn't a dialog
 *
 * The session usually survives, and the next thing you want is to try again — not
 * to dismiss something. Loud enough to be unmissable (one of the few places a
 * danger fill is warranted), quiet enough to scroll past.
 *
 * `retryText` is only set when resending would actually help. A session that died
 * can't be fixed by sending the same message again, and offering a button that
 * can't work costs the user a second failure to find that out.
 */
export function ErrorRow({
  item,
  onRetry,
}: {
  item: Extract<TranscriptItem, { kind: 'error' }>
  onRetry: (itemId: string, text: string) => void
}) {
  return (
    <div className="-mx-3 my-2 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5">
      <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-muted" data-selectable>
        {item.message}
      </p>
      {item.retryText ? (
        <Button
          variant="subtle"
          size="sm"
          onClick={() => onRetry(item.id, item.retryText!)}
          className="shrink-0"
        >
          <RotateCw size={11} />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
