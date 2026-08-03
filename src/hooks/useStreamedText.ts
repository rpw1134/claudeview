import { useSyncExternalStore } from 'react'
import { streamBuffers } from '@/lib/streamBuffers'

/**
 * Subscribe a component to one block's revealed text.
 *
 * `useSyncExternalStore` is the right primitive here rather than `useState` +
 * effect: it subscribes during render, so no delta can slip through the gap between
 * first paint and effect commit, and React's tearing guarantees apply to the
 * concurrent renderer.
 *
 * Only the component rendering an actively streaming block subscribes, so a frame
 * tick re-renders exactly one leaf — the rest of the transcript is untouched.
 */
export function useStreamedText(blockId: string): string {
  return useSyncExternalStore(
    (onChange) => streamBuffers.subscribe(blockId, onChange),
    () => streamBuffers.read(blockId),
    () => streamBuffers.read(blockId),
  )
}

/** Whether this block still has backlog to reveal — drives the caret. */
export function useIsStreaming(blockId: string): boolean {
  return useSyncExternalStore(
    (onChange) => streamBuffers.subscribe(blockId, onChange),
    () => streamBuffers.isStreaming(blockId),
    () => false,
  )
}
