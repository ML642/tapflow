import net from 'net'

/**
 * Whether the relay could listen on `port` right now: probed with the bind `RelayServer.start()` uses,
 * then released.
 *
 * The start commands bring a tunnel up before the relay, and rathole's `setupServer` restarts the
 * VPS-side server. Without this check, a second `tapflow relay start` that was always going to fail on
 * the port would first take down the tunnel of the instance already running. The gap between this check
 * and the relay's own listen is accepted.
 *
 * Only EADDRINUSE counts as taken. Any other failure (EACCES on a low port) is left for the relay to
 * report in its own words.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', (err: NodeJS.ErrnoException) => resolve(err.code !== 'EADDRINUSE'))
    probe.listen({ port, host: '::', ipv6Only: false }, () => probe.close(() => resolve(true)))
  })
}
