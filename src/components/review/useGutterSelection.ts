import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Dragging down the line-number gutter to select a range.
 *
 * The handlers are `useCallback`s over nothing but the setters, and that is
 * load-bearing rather than tidy: a drag changes the selection on every line
 * crossed, and with inline arrows every one of those updates would hand all five
 * thousand rows new props and re-render the whole file per line. Stable handlers
 * mean only the rows whose `selected` actually changed do any work.
 *
 * The release is watched on `window`, because a drag can end anywhere — over the
 * header, over the other split column, outside the window entirely.
 */
export function useGutterSelection() {
  const [selection, setSelection] = useState<{ anchor: number; head: number } | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const stop = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const onGutterMouseDown = useCallback((line: number, shiftKey: boolean) => {
    dragging.current = true
    setSelection((current) =>
      shiftKey && current ? { ...current, head: line } : { anchor: line, head: line },
    )
  }, [])

  const onGutterMouseEnter = useCallback((line: number) => {
    if (!dragging.current) return
    setSelection((current) => (current ? { ...current, head: line } : current))
  }, [])

  const clear = useCallback(() => setSelection(null), [])

  const range = selection
    ? {
        start: Math.min(selection.anchor, selection.head),
        end: Math.max(selection.anchor, selection.head),
      }
    : null

  return { range, clear, onGutterMouseDown, onGutterMouseEnter }
}
