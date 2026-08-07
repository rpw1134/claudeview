/**
 * Test entry. Imports each suite for its side effects, then reports totals.
 *
 * Suites are imported rather than exported-and-called so each file stays a plain
 * top-to-bottom script — the shape that makes them readable as documentation of
 * what the module guarantees.
 */
import './layoutTree.test'
import './attachments.test'
import './attachmentChips.test'
import './errorRow.test'
import './elapsed.test'
import './frontmatter.test'
import './normalizer.test'
import { report } from './harness'

report()
