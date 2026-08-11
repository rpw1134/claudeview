import hljs from 'highlight.js/lib/core'

import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import nginx from 'highlight.js/lib/languages/nginx'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/**
 * The one syntax-highlighting registry in the app.
 *
 * Both consumers — `src/lib/markdown.ts` (fenced code blocks in the transcript) and
 * `src/components/review/highlight.ts` (the review pane) — import *this* module, so
 * a language that highlights in one place highlights in the other. They used to
 * import `highlight.js/lib/common` separately, which meant the review pane's
 * extension map and the transcript's fence-info lookup could silently disagree
 * about what was supported.
 *
 * `lib/core` + explicit registration rather than `lib/common`, because `common` is
 * a fixed set chosen by highlight.js: it omits things this app sees constantly
 * (dockerfile, graphql, nginx, makefile, swift, kotlin) while the cost of adding
 * them is a few KB of grammar each. Everything here is a small pure-JS grammar and
 * is bundled eagerly — lazy-loading grammars would put an async boundary in the
 * middle of the settled-content render pass for no measurable win.
 *
 * `registerLanguage` also installs each grammar's own aliases, so `js`, `ts`, `py`,
 * `sh`, `yml`, `html`, `md` and friends resolve without being listed twice.
 */
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('go', go)
hljs.registerLanguage('graphql', graphql)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('nginx', nginx)
hljs.registerLanguage('php', php)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

// TOML has no grammar of its own in highlight.js; `ini` covers the key/value,
// section-header and string forms that make up almost all real TOML.
hljs.registerAliases(['toml'], { languageName: 'ini' })

export { hljs }

/**
 * File extension -> registered grammar.
 *
 * Explicit rather than inferred: an unknown extension must render as escaped plain
 * text, never as a guess. `highlightAuto` is deliberately not the fallback here —
 * it runs every grammar over the input and scores them, which on a large file costs
 * more than the rest of the review pane put together.
 */
const BY_EXTENSION: Record<string, string> = {
  // TypeScript / JavaScript
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',

  // Markup. `xml` is highlight.js's HTML grammar too, and it degrades gracefully on
  // the single-file component formats, whose outer shape is HTML-like.
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  svelte: 'xml',

  // Styles
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'scss',

  // Data / config
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'ini',
  graphql: 'graphql',
  gql: 'graphql',

  // Prose
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',

  // Systems / application languages
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  rake: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  php: 'php',

  // Misc
  sql: 'sql',
  diff: 'diff',
  patch: 'diff',
  txt: 'plaintext',
}

/**
 * Filenames with no useful extension. Matched case-insensitively on the basename.
 */
const BY_FILENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  'nginx.conf': 'nginx',
  '.env': 'ini',
  '.gitignore': 'plaintext',
  '.bashrc': 'bash',
  '.zshrc': 'bash',
}

/**
 * Resolve a path to a registered grammar name, or `null` when there is no confident
 * answer. Callers render plain escaped text on `null` — an honest non-answer beats
 * a guessed grammar that mislabels half the tokens.
 */
export function languageForPath(path: string): string | null {
  const basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase()

  const byName = BY_FILENAME[basename]
  if (byName) return hljs.getLanguage(byName) ? byName : null

  // `Dockerfile.dev`, `Makefile.local` — the interesting part is the first segment.
  const prefix = BY_FILENAME[basename.slice(0, basename.indexOf('.'))]
  if (basename.includes('.') && prefix) return hljs.getLanguage(prefix) ? prefix : null

  const dot = basename.lastIndexOf('.')
  if (dot < 0) return null
  const language = BY_EXTENSION[basename.slice(dot + 1)]
  return language && hljs.getLanguage(language) ? language : null
}
