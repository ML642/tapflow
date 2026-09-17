import net from 'net'

/**
 * Whether the relay could listen on `port` right now: probed with the bind `RelayServer.start()` uses
 * (dual-stack, or `host` for the tunnel listener), then released.
 *
 * The start commands bring a tunnel up before the relay, and rathole's `setupServer` restarts the
 * VPS-side server. Without this check, a second `tapflow relay start` that was always going to fail on
 * the port would first take down the tunnel of the instance already running. The gap between this check
 * and the relay's own listen is accepted.
 *
 * Only EADDRINUSE counts as taken. Any other failure (EACCES on a low port) is left for the relay to
 * report in its own words.
 */
export function isPortFree(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', (err: NodeJS.ErrnoException) => resolve(err.code !== 'EADDRINUSE'))
    const done = () => probe.close(() => resolve(true))
    // A specific host is probed as itself: the tunnel listener binds 127.0.0.1 alone, and a wildcard bind
    // is not guaranteed to collide with that on macOS.
    if (host === undefined) probe.listen({ port, host: '::', ipv6Only: false }, done)
    else probe.listen({ port, host }, done)
  })
}
