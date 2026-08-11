import { useMemo } from 'react'
import type { ReviewLineMark } from '@shared/ipc'
import { renderMarkdown } from '@/lib/markdown'
import type { ReviewComment } from '@/stores/reviewStore'
import { blockIndexFor, splitMarkdownBlocks, type MarkdownBlock } from './markdownBlocks'

export type PreviewModel = {
  blocks: MarkdownBlock[]
  /** Pre-memoized `{ __html }` per block — see `PreviewBlock` for why. */
  rendered: { __html: string }[]
  /** Block index → the comments that belong under it. */
  byBlock: Map<number, ReviewComment[]>
  /** Comments whose lines fall in no block at all. */
  orphans: ReviewComment[]
  /** Block index → the strongest change mark its lines carry. */
  kinds: Map<number, ReviewLineMark['kind']>
}

/**
 * Everything the preview renders, derived from the file's text.
 *
 * Split out of the component so the component is only layout: the derivations here
 * are the interesting part and they are all pure functions of `content`, `comments`
 * and `lineKinds`, which makes them readable — and memoizable — on their own terms.
 *
 * ## Why each block is parsed separately
 *
 * The document could be rendered in one `renderMarkdown` call and its top-level
 * elements matched back to tokens by index — fewer parses, and cross-block context
 * preserved. It is also brittle in a way that fails silently: `space` and `def`
 * tokens emit nothing, a raw-HTML token can emit several elements, DOMPurify may
 * drop one, and any of those shifts the whole mapping so comments quietly attach to
 * the wrong paragraph.
 *
 * Rendering block by block cannot desynchronize — the block that produced the HTML
 * is the block that owns it. The cost is that anything spanning blocks is lost:
 * **link reference definitions** (`[x]: https://…`) declared elsewhere render as
 * literal text, and a list interrupted by a blank line becomes two lists rather than
 * one continuing one. Documents are small and this is a reading view, so a correct
 * anchor is worth more than those edge cases. Recorded here rather than hidden.
 */
export function usePreviewBlocks(
  content: string,
  comments: ReviewComment[],
  lineKinds: Map<number, ReviewLineMark['kind']>,
): PreviewModel {
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content])

  const rendered = useMemo(
    () => blocks.map((block) => ({ __html: renderMarkdown(block.raw) })),
    [blocks],
  )

  /*
   * Every comment to exactly one block — the first its range overlaps.
   *
   * A comment spanning three paragraphs is still one note, so it renders once, at
   * the top of what it covers. Comments matching no block (blank separators, link
   * definitions, lines past the end after an edit) fall through to `orphans`, where
   * they are labelled with their range instead of silently dropped.
   */
  const { byBlock, orphans } = useMemo(() => {
    const buckets = new Map<number, ReviewComment[]>()
    const loose: ReviewComment[] = []
    for (const comment of comments) {
      const index = blockIndexFor(blocks, comment)
      if (index < 0) {
        loose.push(comment)
        continue
      }
      const bucket = buckets.get(index)
      if (bucket) bucket.push(comment)
      else buckets.set(index, [comment])
    }
    return { byBlock: buckets, orphans: loose }
  }, [blocks, comments])

  /*
   * A block wears the strongest mark its lines carry, `added` beating `modified`
   * for the reason `markMap` gives: a run that added a line describes it better
   * than one that merely touched the region around it. Coarser than the source
   * gutter — the bar says "something in this paragraph changed" — which is the
   * honest resolution a rendered view has.
   */
  const kinds = useMemo(() => {
    const byBlockIndex = new Map<number, ReviewLineMark['kind']>()
    blocks.forEach((block, index) => {
      for (let line = block.startLine; line <= block.endLine; line += 1) {
        const kind = lineKinds.get(line)
        if (!kind) continue
        if (kind === 'added' || !byBlockIndex.has(index)) byBlockIndex.set(index, kind)
      }
    })
    return byBlockIndex
  }, [blocks, lineKinds])

  return { blocks, rendered, byBlock, orphans, kinds }
}
