/**
 * The attachment chip row, rendered.
 *
 * This one exists because the path that *produces* chips can't be automated: a
 * dropped file's real path comes from `webUtils.getPathForFile`, which only returns
 * anything for a genuine user drop, and the alternative route opens a native file
 * dialog. So the chips can't be reached by driving the running app.
 *
 * Rendering the component directly covers what actually matters about it — that a
 * path becomes one labelled, removable chip showing its basename — without needing
 * a drop to have happened.
 *
 * Run with `npm test`.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AttachmentChips } from '@/components/PanelComposer'
import { check, section } from './harness'

section('AttachmentChips')

const html = renderToStaticMarkup(
  createElement(AttachmentChips, {
    paths: ['/Users/x/Projects/app/src/index.ts', '/Users/x/Projects/app/docs'],
    onRemove: () => undefined,
  }),
)

check('renders one chip per path', (html.match(/<li>/g) ?? []).length === 2, html)
check('shows the basename, not the full path', html.includes('index.ts'))
check('does not print the whole path as the label', !html.includes('>/Users/x/Projects'))
check('keeps the full path as a tooltip', html.includes('title="/Users/x/Projects/app/docs"'))
check('each chip has a labelled remove control', html.includes('aria-label="Remove index.ts"'))
check(
  'a directory gets the folder icon, a file the document icon',
  html.includes('lucide-folder') && html.includes('lucide-file-text'),
  html.match(/lucide-[a-z-]+/g)?.join(',') ?? 'no icons',
)

section('AttachmentChips (empty)')
check('no paths renders no chips', !renderToStaticMarkup(
  createElement(AttachmentChips, { paths: [], onRemove: () => undefined }),
).includes('<li>'))
