/**
 * A twenty-line assertion harness.
 *
 * The suites here cover pure logic — layout-tree operations, message composition —
 * which is exactly the code that was deliberately kept out of the components so it
 * could be checked without a DOM, an Electron instance, or a running model. That
 * decision only pays off if running the checks is trivial, so this stays a plain
 * Node script rather than a test framework with its own config, globals, and
 * transform pipeline.
 */

let pass = 0
let fail = 0

export function check(name: string, condition: boolean, extra = ''): void {
  if (condition) {
    pass += 1
    console.log('  PASS ' + name)
  } else {
    fail += 1
    console.log('  FAIL ' + name + (extra ? ' -> ' + extra : ''))
  }
}

export function section(title: string): void {
  console.log(`--- ${title} ---`)
}

/** Print totals and set the exit code. Called once, by the entry module. */
export function report(): void {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
