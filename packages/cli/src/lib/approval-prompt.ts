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
    interactive: process.stdout.isTTY === true,
    confirm: async (message) => {
      const answer = await confirm({ message })
      return !isCancel(answer) && answer === true
    },
    say: step,
  }
}
