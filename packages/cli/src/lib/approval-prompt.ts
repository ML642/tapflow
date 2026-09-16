import { confirm, isCancel } from '@clack/prompts'
import type { ApprovalDeps } from './net-filter.js'
import { step } from './print.js'

/**
 * The terminal's half of `followThroughApproval`, in one place because two commands use it.
 *
 * `net-filter.ts` takes these as parameters rather than importing a prompt library, so the module that
 * runs the installer stays free of anything that reads a keyboard, and its tests can hand the flow a
 * person who answers yes or no.
 *
 * **A cancelled prompt is a no.** Ctrl-C or Esc answers clack's cancel symbol, and every other prompt in
 * `setup` treats that as "skip" rather than as a reason to stop the command — the banner that follows
 * still says what to do.
 */
export function terminalApprovalDeps(): ApprovalDeps {
  return {
    // **Both ends, not only the one that prints.** With stdin at EOF under a terminal — `</dev/null`, a
    // provisioning script — clack draws the prompt, the promise never settles, and node exits 0 with
    // nothing after it. Measured with clack 1.7 under a pty: exit 0, never settled. The command would end
    // without a banner, which is worse than not asking.
    interactive: process.stdout.isTTY === true && process.stdin.isTTY === true,
    confirm: async (message) => {
      const answer = await confirm({ message })
      return !isCancel(answer) && answer === true
    },
    say: step,
  }
}
