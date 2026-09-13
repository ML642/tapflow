import { useEffect, useState } from 'react'

/** `Date.now()`, re-read every `intervalMs` while `active`.
 *
 *  Re-read immediately whenever it resumes or the interval changes, rather than on the next tick: a tab
 *  brought back after an hour, or a switch from 7d to 1h, should show the window as it is now and not as it
 *  was up to a minute ago. */
export function useFlowingNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
  return now
}
