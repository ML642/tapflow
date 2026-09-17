---
'@tapflowio/relay': minor
'tapflow': minor
---

Tunnel traffic no longer counts as local. The relay opens a loopback-only tunnel port (`TAPFLOW_TUNNEL_PORT`) where every connection must authenticate, and `tapflow start` and `tapflow relay start` open it on 4001 whenever a tunnel is configured. The CLI points the rathole client at it, warns when `tailscale serve` forwards to the relay port or `tailscaled` runs in userspace-networking mode, and stops rathole clients left behind by an exited tapflow process.
