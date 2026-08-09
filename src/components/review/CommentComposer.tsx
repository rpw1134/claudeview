import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

/**
 * The note being written, pinned directly under the lines it is about.
 *
 * Inline rather than a popover on purpose. A popover floats over the code, which
 * is the one thing you need to keep reading while writing the comment, and it has
 * to be positioned against a scrolling container that moves underneath it. A row
 * in the flow costs nothing to position, pushes the code down instead of covering
 * it, and lands exactly where the finished comment will sit — so the transition
 * from writing to written moves nothing on screen.
 *
 * Enter submits and Shift+Enter makes a newline, matching the session composer.
 * Two places to type in one app must not disagree about what Enter does.
 */
export function CommentComposer({
  startLine,
  endLine,
  onSubmit,
  onCancel,
}: {
  startLine: number
  endLine: number
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const submit = () => {
    if (!text.trim()) return
    onSubmit(text)
    setText('')
  }

  const range = startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`

  return (
    <div data-focus-host className="hand-sm-1 bg-raised px-3 py-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        rows={2}
        aria-label={`Comment on ${range}`}
        placeholder={`Comment on ${range}…`}
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-text
                   outline-none placeholder:text-text-faint"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!text.trim()} onClick={submit}>
          Comment
        </Button>
      </div>
    </div>
  )
}
