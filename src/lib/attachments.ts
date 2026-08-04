/**
 * Turning attached paths into a message.
 *
 * Kept out of the composer component for the same reason the layout tree is: it's
 * pure, it has edge cases worth pinning down (spaces in paths, an attachment-only
 * message), and a component is a bad place to verify either.
 *
 * ## Paths, not contents
 *
 * Attachments are sent as *references*. The agent already has file tools and a
 * permission model, so a path lets it read exactly what it needs, when it needs it.
 * Inlining the bytes instead would blow up the turn on a large file, make a folder
 * attachment meaningless, and route the read around the permission mode the user
 * picked in the composer.
 */

/**
 * Fold attachment paths into the outgoing message text.
 *
 * `@`-prefixed when the path has no whitespace — the CLI expands that as a file
 * mention. Paths containing spaces can't use that form (the mention parser stops at
 * the space and would attach the wrong thing), so they go in backticks, which reads
 * identically to the model and is unambiguous to a human.
 */
export function composeMessage(text: string, attachments: string[]): string {
  if (attachments.length === 0) return text

  const references = attachments
    .map((path) => (/\s/.test(path) ? `- \`${path}\`` : `- @${path}`))
    .join('\n')

  // An attachment-only message is a legitimate turn — "look at this" — so it must
  // not send a leading blank line or an empty prompt.
  return text ? `${text}\n\nAttached:\n${references}` : `Attached:\n${references}`
}

/** Last path segment, for display. Tolerates trailing slashes on directories. */
export function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

/**
 * Merge new paths into the existing list, de-duplicating and capping.
 *
 * Dropping the same file twice should be a no-op rather than two identical rows,
 * and the cap keeps a stray drop of a large folder selection from turning the
 * composer into a wall of chips.
 */
export function mergeAttachments(existing: string[], added: string[], limit: number): string[] {
  const merged = [...existing]
  for (const path of added) if (!merged.includes(path)) merged.push(path)
  return merged.slice(0, limit)
}
