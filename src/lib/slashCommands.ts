/**
 * Slash-command completion, as pure functions.
 *
 * Kept out of the composer so the rules that are easy to get subtly wrong — where
 * the token ends, when the caret has left it, what "accepting" does to the rest of
 * the line — can be pinned down in `test/slashCommands.test.ts` without a DOM.
 */

/** The leading slash token, when the caret is inside it. */
export type SlashToken = {
  /** Everything after the `/`, i.e. what completions are matched against. */
  query: string
  /** Index one past the token's last character. */
  end: number
}

/**
 * The `/token` the caret currently sits in, or null.
 *
 * Only ever the *leading* token: `/usage` is a command, `see /usage` is prose about
 * one, and completing inside the latter would rewrite a sentence the user is
 * writing. The caret must also still be within the token — moving it past the
 * first space means you're done naming the command and onto its arguments.
 */
export function activeSlashToken(draft: string, caret: number): SlashToken | null {
  if (!draft.startsWith('/')) return null

  const match = /\s/.exec(draft)
  const end = match ? match.index : draft.length
  if (caret > end || caret < 1) return null

  return { query: draft.slice(1, end), end }
}

/**
 * Commands whose name starts with `query`, case-insensitively.
 *
 * Prefix rather than substring: you type a command from the front, and a substring
 * match on one character offers a list whose ordering has no relationship to what
 * you typed.
 */
export function matchSlashCommands(commands: string[], query: string): string[] {
  const needle = query.toLowerCase()
  return commands.filter((command) => command.toLowerCase().startsWith(needle))
}

/**
 * Replace the leading token with `name`, leaving the caret after the space.
 *
 * The space is part of accepting: a command is nearly always followed by either an
 * argument or nothing, and both are better served by a caret that has already
 * cleared the word than by one glued to its last letter. Any whitespace that
 * already followed the token is absorbed so accepting can't produce a double space.
 */
export function applySlashCommand(
  draft: string,
  token: SlashToken,
  name: string,
): { text: string; caret: number } {
  const rest = draft.slice(token.end).replace(/^[^\S\n]+/, '')
  return { text: `/${name} ${rest}`, caret: name.length + 2 }
}
