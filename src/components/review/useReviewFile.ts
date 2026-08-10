import { useEffect, useRef, useState } from 'react'
import type { ReviewLineMark } from '@shared/ipc'
import { api } from '@/lib/api'

export type ReviewFileBody = {
  content: string
  marks: ReviewLineMark[]
  tooLarge: boolean
}

export type ReviewFileFetch = {
  body: ReviewFileBody | null
  /** True only before the first answer for this path — not between refreshes. */
  loading: boolean
  /** The file is gone (deleted, or no longer tracked). */
  missing: boolean
}

/**
 * Fetch one tracked file's contents and marks.
 *
 * Bodies are not in the push envelope — a review set can span hundreds of files
 * and the pane shows one — so this is a per-file request, re-issued whenever the
 * file changes underneath you. `version` is the entry's `lastChangedAt`: passing
 * it rather than watching the whole `files` array means an unrelated file being
 * saved doesn't refetch the one you're reading.
 *
 * The request token is the part that matters for correctness. Clicking quickly
 * through a tree issues overlapping requests, and IPC replies are not ordered
 * with respect to each other — without the token, a slow answer for the file you
 * left can land after the fast one for the file you're on and paint the wrong
 * contents under the right filename.
 */
export function useReviewFile(path: string | null, version: number): ReviewFileFetch {
  const [state, setState] = useState<ReviewFileFetch>({
    body: null,
    loading: path !== null,
    missing: false,
  })
  const token = useRef(0)

  useEffect(() => {
    const current = ++token.current

    if (!path) {
      setState({ body: null, loading: false, missing: false })
      return
    }

    setState((previous) => ({ ...previous, loading: previous.body === null }))

    void api['review:file']({ path })
      .then((result) => {
        if (token.current !== current) return
        setState({
          body: result,
          loading: false,
          missing: result === null,
        })
      })
      .catch(() => {
        if (token.current !== current) return
        setState({ body: null, loading: false, missing: true })
      })
  }, [path, version])

  return state
}

/** Marks are runs; the gutter needs a per-line answer. */
export function markMap(marks: ReviewLineMark[]): Map<number, ReviewLineMark['kind']> {
  const byLine = new Map<number, ReviewLineMark['kind']>()
  for (const mark of marks) {
    for (let line = mark.start; line < mark.start + mark.count; line += 1) {
      // 'added' wins a collision: a run that added a line describes it better
      // than one that merely touched the region around it.
      if (mark.kind === 'added' || !byLine.has(line)) byLine.set(line, mark.kind)
    }
  }
  return byLine
}

/**
 * The whole file's change summary, as two numbers.
 *
 * Counts rather than a pre-joined `"+12 · ~5"` string: the header renders them as
 * two separately tinted pills (success for added, accent for modified), and a
 * string would have had the header parse back out what this function just threw
 * away. Each pill still carries its own `+`/`~` sigil, so the hue is never the
 * only thing distinguishing them.
 */
export function countMarks(marks: ReviewLineMark[]): { added: number; modified: number } {
  let added = 0
  let modified = 0
  for (const mark of marks) {
    if (mark.kind === 'added') added += mark.count
    else modified += mark.count
  }
  return { added, modified }
}
