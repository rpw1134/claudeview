/**
 * The pane's outer frame: header on top, one scrolling body beneath.
 *
 * `frameRef` is how the pane measures itself — split view needs to know whether
 * there is room for two columns, and the answer is a fact about this element rather
 * than about the window, since a review pane can sit in a narrow mosaic tile.
 */
export function Pane({
  header,
  frameRef,
  children,
}: {
  header: React.ReactNode
  frameRef?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}) {
  return (
    <div ref={frameRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      {children}
    </div>
  )
}

/** A centred message where the code would be: deleted, too large, empty, loading. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  )
}
