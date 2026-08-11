/**
 * Folding consecutive tool calls into one row.
 *
 * The rules are all about boundaries — where a run starts, where a single call
 * stays a single card, when a group has to open itself — and none of them are
 * things you'd notice going wrong without an agentic turn in front of you.
 *
 * Run with `npm test`.
 */
import type { TranscriptItem } from '@/types/session'
import {
  describeToolCall,
  groupTranscriptItems,
  shouldAutoExpand,
  summarizeToolGroup,
  type ToolItem,
} from '@/lib/toolGroups'
import { check, section } from './harness'

let counter = 0
function tool(
  name: string,
  input: unknown = {},
  status: ToolItem['status'] = 'ok',
  spawnedLaneId?: string,
): ToolItem {
  counter += 1
  const id = `t${counter}`
  return { kind: 'tool', id, toolUseId: id, name, input, status, ...(spawnedLaneId ? { spawnedLaneId } : {}) }
}

const text: TranscriptItem = { kind: 'text', id: 'x1', blockId: 'x1' }

section('groupTranscriptItems')

check('no items, no runs', groupTranscriptItems([]).length === 0)

{
  const runs = groupTranscriptItems([text, tool('Read'), text])
  check('a lone tool call is not grouped', runs.length === 3 && runs[1]!.kind === 'item')
}

{
  const runs = groupTranscriptItems([tool('Read'), tool('Edit'), tool('Bash')])
  const [first] = runs
  check('adjacent calls become one group', runs.length === 1 && first!.kind === 'tool-group')
  check(
    'the group keeps every call, in order',
    first!.kind === 'tool-group' &&
      first.items.map((item) => item.name).join(',') === 'Read,Edit,Bash',
  )
}

{
  const runs = groupTranscriptItems([tool('Read'), tool('Edit'), text, tool('Bash'), tool('Grep')])
  check(
    'a non-tool item splits the run',
    runs.length === 3 &&
      runs[0]!.kind === 'tool-group' &&
      runs[1]!.kind === 'item' &&
      runs[2]!.kind === 'tool-group',
  )
}

{
  const a = tool('Read')
  const runs = groupTranscriptItems([a, tool('Edit')])
  check('group id is the first call id', runs[0]!.id === a.id, runs[0]!.id)
}

section('summarizeToolGroup')

{
  const summary = summarizeToolGroup([tool('Read'), tool('Edit', {}, 'running')])
  check('running while the last call is in flight', summary.running)
  check('counts the calls', summary.total === 2)
}

{
  const summary = summarizeToolGroup([
    tool('Read'),
    tool('Edit', {}, 'error'),
    tool('Bash', {}, 'ok'),
  ])
  check('settles once the last call lands', !summary.running)
  check('counts successes', summary.ok === 2, String(summary.ok))
  check('counts failures', summary.failed === 1, String(summary.failed))
}

section('describeToolCall')

check(
  'a file path shows as its basename',
  describeToolCall(tool('Edit', { file_path: '/a/b/streamBuffers.ts' })) === 'Edit · streamBuffers.ts',
)
check(
  'a notebook path counts as a path',
  describeToolCall(tool('Read', { notebook_path: '/a/b/notes.ipynb' })) === 'Read · notes.ipynb',
)
check(
  'Bash shows the executable, not the arguments',
  describeToolCall(tool('Bash', { command: 'npm run typecheck --silent' })) === 'Bash · npm',
)
check(
  'a command on a non-Bash tool is not a target',
  describeToolCall(tool('Grep', { command: 'nope' })) === 'Grep',
)
check('no identifying input leaves the bare name', describeToolCall(tool('Task', {})) === 'Task')

section('shouldAutoExpand')

check('a clean group stays collapsed', !shouldAutoExpand([tool('Read'), tool('Edit')]))
check('a failure opens the group', shouldAutoExpand([tool('Read'), tool('Edit', {}, 'error')]))
check(
  'a subagent-spawning call opens the group, so its lane stays reachable',
  shouldAutoExpand([tool('Read'), tool('Task', {}, 'ok', 'lane-2')]),
)
