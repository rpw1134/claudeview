/**
 * Frontmatter round-trips.
 *
 * The config editors parse a file into form fields and serialize it back; the
 * guarantee that matters is that nothing the form doesn't model is lost, and that
 * a broken file degrades to "all body" instead of an exception.
 *
 * Run with `npm test`.
 */
import {
  parseAgentFrontmatter,
  parseSkillFrontmatter,
  serializeFrontmatter,
} from '@shared/frontmatter'
import { check, section } from './harness'

section('parseAgentFrontmatter')

{
  const { frontmatter, body } = parseAgentFrontmatter(
    '---\nname: reviewer\ndescription: Reviews code\ntools:\n  - Read\n---\n\nBe thorough.\n',
  )
  check('name parses', frontmatter.name === 'reviewer')
  check('tools parse as array', Array.isArray(frontmatter.tools) && frontmatter.tools[0] === 'Read')
  check('body excludes the fence', body.trim() === 'Be thorough.')
}

{
  const input = 'no frontmatter at all'
  const { frontmatter, body } = parseAgentFrontmatter(input)
  check('missing frontmatter yields empty object', Object.keys(frontmatter).length === 0)
  check('missing frontmatter keeps full body', body === input)
}

{
  const input = '---\n: not: [valid yaml\n---\nbody'
  const { frontmatter, body } = parseAgentFrontmatter(input)
  check('malformed YAML fails soft', Object.keys(frontmatter).length === 0 && body === input)
}

{
  const crlf = '---\r\nname: win\r\n---\r\nbody'
  check('CRLF files parse', parseAgentFrontmatter(crlf).frontmatter.name === 'win')
}

section('serializeFrontmatter')

{
  const out = serializeFrontmatter(
    { description: 'does things', name: 'helper', custom: 'kept', empty: '', list: [] },
    'body\n',
  )
  check('name leads', out.startsWith('---\nname: helper\n'))
  check('description second', out.includes('name: helper\ndescription: does things\n'))
  check('unknown keys survive', out.includes('custom: kept'))
  check('empty values are dropped', !out.includes('empty') && !out.includes('list'))
}

check(
  'all-empty frontmatter serializes to bare body',
  serializeFrontmatter({ a: '', b: [] }, 'just text') === 'just text',
)

{
  // The invariant the editors depend on: parse -> serialize with no edits keeps
  // every field, including ones the form has no control for.
  const original =
    '---\nname: deep\ndescription: keeps unknowns\nmemory: project\nisolation: worktree\n---\n\nPrompt.\n'
  const { frontmatter, body } = parseAgentFrontmatter(original)
  const rewritten = serializeFrontmatter(frontmatter, body)
  const reparsed = parseAgentFrontmatter(rewritten)
  check('round-trip keeps unknown fields', reparsed.frontmatter.memory === 'project')
  check('round-trip keeps isolation', reparsed.frontmatter.isolation === 'worktree')
  check('round-trip keeps body', reparsed.body.trim() === 'Prompt.')
}

section('parseSkillFrontmatter')

{
  const { frontmatter } = parseSkillFrontmatter(
    '---\nname: s\nuser-invocable: true\nallowed-tools:\n  - Bash\n---\nbody',
  )
  check('hyphenated keys parse', frontmatter['user-invocable'] === true)
  check(
    'allowed-tools parses',
    Array.isArray(frontmatter['allowed-tools']) && frontmatter['allowed-tools'][0] === 'Bash',
  )
}
