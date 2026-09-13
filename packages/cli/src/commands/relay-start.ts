import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { RelayServer, initDb, config, loadedEnvPath, createCertProvider, startTlsBackgroundTasks, buildCorsOrigins, proxyWithoutPublicUrlWarning, resolveRelayDisplayHost } from '@tapflowio/relay'
import type { TunnelRuntime } from '@tapflowio/relay'
import { banner, step, warn } from '../lib/print.js'
import { startConfiguredTunnel, tunnelRuntimeFor } from '../lib/tunnel-runner.js'
import { isPortFree } from '../lib/port-available.js'
import type { TunnelPlugin } from '../lib/tunnel.js'

export interface RelayStartOptions {
  port?: number
  tunnel?: string
}

const DEFAULT_PORT = config.local.port

const portSchema = z.number().int().min(1).max(65535, 'port must be between 1 and 65535')

const SUPPORTED_PROVIDERS = ['rathole', 'tailscale']

export async function cmdRelayStart(opts: RelayStartOptions): Promise<void> {
  const rawPort = opts.port ?? DEFAULT_PORT
  const portResult = portSchema.safeParse(rawPort)
  if (!portResult.success) {
    banner('error', 'INVALID CONFIG', [`--port: ${portResult.error.issues[0].message}`])
    process.exit(1)
  }
  const port = portResult.data

  // Tunnel settings are refused before anything starts, now that the tunnel comes up before the relay.
  if (opts.tunnel && !SUPPORTED_PROVIDERS.includes(opts.tunnel)) {
    banner('error', 'TUNNEL CONFIG ERROR', [`Unsupported tunnel provider: "${opts.tunnel}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`])
    process.exit(1)
  }
  const tunnelCfg = config.tunnel
  if (opts.tunnel && !tunnelCfg) {
    banner('error', 'TUNNEL CONFIG ERROR', ['tunnel section is required in tapflow.config.json when using --tunnel'])
    process.exit(1)
  }

  if (!fs.existsSync(path.join(process.cwd(), 'tapflow.config.json'))) {
    warn('tapflow.config.json not found — using defaults. Run tapflow init to configure.')
  }
  // config already loaded <dataDir>/.env before reading any secret (JWT/SMTP/DNS tokens); just report it.
  if (loadedEnvPath) step(`Loaded credentials from ${loadedEnvPath}`)
  initDb(path.join(config.local.dataDir, 'tapflow.db'))

  let tls: { cert: string; key: string } | undefined
  let certProvider: ReturnType<typeof createCertProvider> | null = null
  let displayHost = 'localhost'
  if (config.tls) {
    certProvider = createCertProvider(config.tls, { dataDir: config.local.dataDir })
    const material = await certProvider.ensureCert()
    tls = { cert: material.cert, key: material.key }
    displayHost = resolveRelayDisplayHost(config.tls, material.cert, warn)
  }
  const httpScheme = tls ? 'https' : 'http'
  const wsScheme = tls ? 'wss' : 'ws'
  const agentConnectHost = tls && displayHost.toLowerCase() !== 'localhost' ? displayHost : '<host>'

  // Tunnel before the relay, port checked first: same order and reasons as `tapflow start` (commands/start.ts).
  let tunnel: TunnelPlugin | null = null
  let publicUrl: string | null = null
  let tunnelRuntime: TunnelRuntime | undefined
  if (tunnelCfg != null) {
    if (!(await isPortFree(port))) {
      throw new Error(`Port ${port} is already in use. Stop the existing process and try again.`)
    }
    const started = await startConfiguredTunnel(tunnelCfg, port)
    tunnel = started.tunnel
    tunnelRuntime = tunnelRuntimeFor(started.publicUrl, tls !== undefined)
    // The banner advertises only what the relay will hand out.
    publicUrl = tunnelRuntime.publicUrl
    if (started.publicUrl && !publicUrl) warn(`Not advertising ${started.publicUrl}: this relay serves HTTPS, and a plain-HTTP tunnel URL does not reach it.`)
  }

  const proxyWarning = proxyWithoutPublicUrlWarning(config, tunnelRuntime)
  if (proxyWarning) warn(proxyWarning)
  let server: RelayServer
  try {
    // Construction is inside the try too: a TLS key that does not match its cert throws here.
    server = new RelayServer({ port, uploadsDir: path.join(config.local.dataDir, 'uploads'), wsBackpressureBytes: config.local.wsBackpressureBytes, trustedProxies: config.local.trustedProxies, corsOrigins: buildCorsOrigins(config, port, tunnelRuntime), tls, tunnel: tunnelRuntime })
    await server.start()
  } catch (err) {
    await tunnel?.stop()
    throw err
  }
  step(`Relay started on ${httpScheme}://${displayHost}:${port}`)
  const stopTls = certProvider ? startTlsBackgroundTasks(certProvider, server, config.tls) : null

  banner('success', 'TAPFLOW RELAY READY', [
    `Relay  : ${httpScheme}://${displayHost}:${port}`,
    ...(publicUrl ? [`Public : ${publicUrl}`] : []),
    `Connect Mac agents:  tapflow agent start --relay ${wsScheme}://${agentConnectHost}:${port} --token <agent-PAT>`,
    `  Issue an 'agent'-scope token in the dashboard (Settings → Tokens).`,
    'Press Ctrl+C to stop.',
  ])

  process.on('SIGINT', () => {
    stopTls?.()
    void tunnel?.stop()
    process.exit(0)
  })
}
