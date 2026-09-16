import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SHEET_OPENER_SCRIPT } from '../../lib/net-filter.js'

/**
 * **The opener script itself, run by a real shell.** `net-filter.test.ts` mocks `child_process`, so it
 * can say the script was started with the right arguments and nothing about whether the script works.
 * A typo in it fails silently in production: the sheet simply never opens. So it runs here against
 * stand-ins for `systemextensionsctl` and `open`, which is what taking the commands as parameters is for.
 */

const BUNDLE = 'dev.tapflow.netfilter.ext'
const line = (bundle: string, state: string) =>
  `*\t*\t6FBS3QP893\t${bundle} (1.0/1788872007)\t${bundle}\t[${state}]`
/** The state measured on macOS 27 for a request nobody has approved yet. */
const WAITING = line(BUNDLE, 'activated waiting for user')
const ENABLED = line(BUNDLE, 'activated enabled')
const URL = 'x-apple.systempreferences:test'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tapflow-sheet-opener-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** A stand-in `systemextensionsctl`: `first` for the first `looks` calls, `then` after. Counts calls. */
function lister(first: string, looks: number, then: string, failFirst = false): string {
  const p = join(dir, 'list')
  writeFileSync(p, [
    '#!/bin/sh',
    '[ "$1" = list ] || exit 64',
    `n=$(cat '${dir}/count' 2>/dev/null || echo 0)`,
    `echo $((n+1)) > '${dir}/count'`,
    `if [ "$n" -lt ${looks} ]; then`,
    failFirst ? `  echo 'sysextd unavailable' >&2; exit 1` : `  printf '%s\\n' '${first}'`,
    'else',
    `  printf '%s\\n' '${then}'`,
    'fi',
    '',
  ].join('\n'))
  chmodSync(p, 0o755)
  return p
}

function opener(): string {
  const p = join(dir, 'open')
  writeFileSync(p, `#!/bin/sh\nprintf '%s\\n' "$@" >> '${dir}/opened'\n`)
  chmodSync(p, 0o755)
  return p
}

function run(list: string, bundle: string, looks: number, gap = '0.01') {
  const started = Date.now()
  const r = spawnSync('/bin/sh', ['-c', SHEET_OPENER_SCRIPT, 'test', list, bundle, opener(), URL, String(looks), gap], {
    encoding: 'utf8', timeout: 10_000,
  })
  return {
    status: r.status,
    stderr: r.stderr,
    ms: Date.now() - started,
    opened: existsSync(join(dir, 'opened')) ? readFileSync(join(dir, 'opened'), 'utf8') : null,
    looks: Number(readFileSync(join(dir, 'count'), 'utf8')),
  }
}

describe('the approval sheet opener', () => {
  it('opens the sheet once the request is waiting, once, and stops looking', () => {
    const r = run(lister(ENABLED, 2, WAITING), BUNDLE, 20)
    expect(r.opened).toBe(`${URL}\n`)
    expect(r.looks).toBe(3)
    expect(r.status).toBe(0)
  })

  it('opens at once for a request that was already waiting — the rerun case', () => {
    const r = run(lister(WAITING, 0, WAITING), BUNDLE, 20)
    expect(r.opened).toBe(`${URL}\n`)
    expect(r.looks).toBe(1)
  })

  it('gives up without opening when nothing waits, after the looks it was given', () => {
    // A Mac whose MDM approves in advance never shows the state, and nothing should appear there.
    const r = run(lister(ENABLED, 0, ENABLED), BUNDLE, 3)
    expect(r.opened).toBeNull()
    expect(r.looks).toBe(3)
    expect(r.status).toBe(0)
  })

  it('sleeps between looks rather than spinning', () => {
    // Five looks 50ms apart: four sleeps at least. A spin would finish in a few milliseconds.
    const r = run(lister(ENABLED, 0, ENABLED), BUNDLE, 5, '0.05')
    expect(r.looks).toBe(5)
    expect(r.ms).toBeGreaterThanOrEqual(180)
  })

  it('does not open for another extension that is waiting', () => {
    const r = run(lister(line('com.example.other', 'activated waiting for user'), 0, ''), BUNDLE, 3)
    expect(r.opened).toBeNull()
  })

  it('matches the bundle id literally', () => {
    // As a pattern, each `.` in the id matches any character.
    const r = run(lister(line('devXtapflowXnetfilterXext', 'activated waiting for user'), 0, ''), BUNDLE, 3)
    expect(r.opened).toBeNull()
  })

  it('treats a failing list as one more look, quietly', () => {
    const r = run(lister('', 2, WAITING, true), BUNDLE, 20)
    expect(r.opened).toBe(`${URL}\n`)
    expect(r.stderr).toBe('')
  })
})
