/**
 * Math delimiter boundaries.
 *
 * Every rule in `markdownSyntax` exists to *not* fire on something, so the negative
 * cases here carry more weight than the positive ones: a formula that renders as
 * text is a cosmetic miss, while "$5 and $12" turning into italic gibberish is a
 * corrupted answer.
 *
 * Rendering itself (KaTeX output, sanitization) is verified in a browser, not here.
 *
 * Run with `npm test`.
 */
import {
  hasOpenCodeFence,
  hasOpenDisplayMath,
  isMathFence,
  matchDisplayMath,
  matchInlineMath,
  splitStream,
} from '@/lib/markdownSyntax'
import { check, section } from './harness'

section('matchDisplayMath')

{
  const single = matchDisplayMath('$$x^2$$')
  check('single-line $$ matches', single?.text === 'x^2')

  // The regression: models write display math across three lines, and a `.`-based
  // pattern silently drops it to literal text.
  const multi = matchDisplayMath('$$\nE = mc^2\n$$\n')
  check('multi-line $$ matches', multi?.text === 'E = mc^2', String(multi?.text))
  check('multi-line $$ consumes its whole block', multi?.raw === '$$\nE = mc^2\n$$\n')

  const spaced = matchDisplayMath('$$\nE = mc^2\n$$   \n')
  check('trailing whitespace after the closer is tolerated', spaced?.text === 'E = mc^2')

  const bracket = matchDisplayMath('\\[\na^2 + b^2 = c^2\n\\]\n')
  check('multi-line \\[ \\] matches', bracket?.text === 'a^2 + b^2 = c^2')

  const many = matchDisplayMath('$$\na\n$$\n\n$$\nb\n$$\n')
  check('adjacent blocks do not merge', many?.text === 'a', String(many?.text))

  const aligned = matchDisplayMath('$$\n\\begin{aligned}\nx &= 1 \\\\\ny &= 2\n\\end{aligned}\n$$')
  check('an aligned environment survives', aligned?.text.includes('\\begin{aligned}') === true)
}

{
  check('a lone opener does not match', matchDisplayMath('$$\nE = mc') === null)
  check('empty delimiters do not match', matchDisplayMath('$$ $$\n') === null)
  check('prose is not display math', matchDisplayMath('Two dollars, $$, is odd.') === null)
  // Block content that merely *contains* `$$` later must not be claimed from the top.
  check('the opener must be at the start', matchDisplayMath('cost $$5\n') === null)
}

section('matchInlineMath')

{
  check('subscripted variable', matchInlineMath('$x_1$ is first')?.text === 'x_1')
  check('paren form', matchInlineMath('\\(a+b\\) etc')?.text === 'a+b')
  check('short bare symbol', matchInlineMath('$n$ items')?.text === 'n')
}

{
  check('two prices stay prose', matchInlineMath('$5 and $12 total') === null)
  check('a price range stays prose', matchInlineMath('$5-$10') === null)
  check('a formatted amount stays prose', matchInlineMath('$1,000$') === null)
  check('a shell variable stays prose', matchInlineMath('$PATH:$HOME') === null)
  check('a braced shell variable stays prose', matchInlineMath('${HOME}$x') === null)
  check('padded delimiters stay prose', matchInlineMath('$ x + y $') === null)
  check('math cannot span a newline', matchInlineMath('$a\nb$') === null)
  check('prose between dollars stays prose', matchInlineMath('$for the whole team$') === null)
}

section('isMathFence')

{
  check('math', isMathFence('math'))
  check('latex', isMathFence('latex'))
  check('katex', isMathFence('katex'))
  check('tex', isMathFence('tex'))
  check('case and padding ignored', isMathFence('  LaTeX  '))
  // marked hands over the entire info string.
  check('only the first word counts', isMathFence('math title=derivation'))
}

{
  check('js is code', !isMathFence('js'))
  check('mermaid is a diagram', !isMathFence('mermaid'))
  check('an untagged fence is code', !isMathFence(''))
  check('a lookalike is code', !isMathFence('mathematica'))
}

section('splitStream')

{
  const padding = 'x'.repeat(220)

  const [stable, tail] = splitStream(`${padding}\n\nsecond paragraph`)
  check('splits at the last blank line', stable === `${padding}\n\n` && tail === 'second paragraph')

  // The half-streamed multi-line display block: it must stay whole in the tail, or
  // the stable half parses `$$` alone and flashes literal dollars.
  const [openStable, openTail] = splitStream(`${padding}\n\n$$\nE = `)
  check('an open $$ block stays entirely in the tail', openTail === '$$\nE = ')
  check('the settled prefix stops before the opener', openStable === `${padding}\n\n`)

  const [, closedTail] = splitStream(`${padding}\n\n$$\nE = mc^2\n$$\n\ndone`)
  check('a closed $$ block settles', closedTail === 'done', closedTail)

  const [fenceStable, fenceTail] = splitStream(`${padding}\n\n\`\`\`math\nE = `)
  check('an open math fence stays in the tail', fenceTail === '```math\nE = ')
  check('the prefix stops before the fence', fenceStable === `${padding}\n\n`)

  check('short text is all tail', splitStream('$$\nE = ')[1] === '$$\nE = ')
}

{
  check('one $$ is open', hasOpenDisplayMath('$$\nE = '))
  check('two $$ are closed', !hasOpenDisplayMath('$$\nE = mc^2\n$$'))
  check('inline dollars do not open a block', !hasOpenDisplayMath('$5 and $12 and $x_1$'))
  check('one fence is open', hasOpenCodeFence('```math\nE ='))
  check('two fences are closed', !hasOpenCodeFence('```math\nE = mc^2\n```'))
}
