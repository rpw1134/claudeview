import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes, letting later conflicting utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Short relative time ("4m ago") for session lists. */
export function timeAgo(epochMs: number | undefined): string {
  if (!epochMs) return ''
  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** `/Users/me/Projects/app` -> `~/Projects/app`, with a leading ellipsis if long. */
export function shortenPath(fullPath: string | undefined, home?: string): string {
  if (!fullPath) return ''
  let path = fullPath
  if (home && path.startsWith(home)) path = `~${path.slice(home.length)}`
  const segments = path.split('/')
  if (segments.length <= 4) return path
  return `…/${segments.slice(-3).join('/')}`
}

/** Compact token counts: 950, 12.4k, 1.8M. Keeps the status bar readable. */
export function compactTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}
