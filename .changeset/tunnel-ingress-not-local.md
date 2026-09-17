---
'@tapflowio/relay': minor
'tapflow': minor
---

Tunnel traffic no longer counts as local. The relay opens a loopback-only tunnel port (`TAPFLOW_TUNNEL_PORT`, default 4001) where every connection must authenticate. The CLI points the rathole client at it, warns when `tailscale serve` forwards to the relay port or `tailscaled` runs in userspace-networking mode, and stops rathole clients left behind by an exited tapflow process.
