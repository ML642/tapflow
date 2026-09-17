import { describe, it, expect } from 'vitest'
import net from 'node:net'
import { isPortFree } from '../../lib/port-available.js'

// Same bind as RelayServer.start(): a probe on a different address could call a port free that the
// relay then fails to take.
function listen(port = 0): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen({ port, host: '::', ipv6Only: false }, () => resolve(server))
  })
}

const close = (server: net.Server) => new Promise<void>((resolve) => server.close(() => resolve()))

describe('isPortFree', () => {
  it('reports a port something is listening on as taken', async () => {
    const server = await listen()
    const { port } = server.address() as net.AddressInfo
    try {
      expect(await isPortFree(port)).toBe(false)
    } finally {
      await close(server)
    }
  })

  it('reports a released port as free, and does not keep holding it', async () => {
    const first = await listen()
    const { port } = first.address() as net.AddressInfo
    await close(first)

    expect(await isPortFree(port)).toBe(true)
    // Rejects with EADDRINUSE if the probe left its socket open.
    const again = await listen(port)
    await close(again)
  })

  // The tunnel listener binds 127.0.0.1 alone, and a wildcard probe is not guaranteed to collide with that
  // on macOS, so the probe has to ask about the same address.
  it('probes the address it is given', async () => {
    const server = net.createServer()
    await new Promise<void>((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
    const { port } = server.address() as net.AddressInfo
    try {
      expect(await isPortFree(port, '127.0.0.1')).toBe(false)
    } finally {
      await close(server)
    }
    expect(await isPortFree(port, '127.0.0.1')).toBe(true)
  })
})
