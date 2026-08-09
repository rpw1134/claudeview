/**
 * Review mode's placeholder.
 *
 * Review is a second workspace *mode*, a sibling of the panel mosaic rather than
 * of config — App.tsx swaps this in for the mosaic/NewSessionPanel area while
 * leaving the toolbar and the config view untouched. Nothing to scaffold here yet
 * beyond the surface existing and being reachable, so it's one centred line.
 */
export function ReviewView() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <p className="text-sm text-text-faint">Review mode — coming online</p>
    </div>
  )
}
