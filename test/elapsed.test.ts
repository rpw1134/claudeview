/**
 * The elapsed-time format on the activity indicator.
 *
 * Worth pinning down because the interesting cases are all at the boundary, and a
 * turn only reaches them after sitting there for a minute — not something you'd
 * notice while clicking around.
 *
 * Run with `npm test`.
 */
import { formatElapsed } from '@/components/ActivityIndicator'
import { check, section } from './harness'

section('formatElapsed')

check('seconds alone below a minute', formatElapsed(0) === '0s')
check('still seconds at 59', formatElapsed(59) === '59s')
check('switches at exactly 60', formatElapsed(60) === '1m 00s', formatElapsed(60))
check('pads the seconds so the width is stable', formatElapsed(65) === '1m 05s', formatElapsed(65))
check('no padding needed past ten', formatElapsed(119) === '1m 59s', formatElapsed(119))
check('rolls to the next minute', formatElapsed(120) === '2m 00s', formatElapsed(120))
check('long turns keep counting', formatElapsed(3725) === '62m 05s', formatElapsed(3725))
