---
'@tapflowio/relay': patch
'tapflow': patch
---

**The invite link the dashboard copies is the one the invitation email carries** ([#788](https://github.com/jo-duchan/tapflow/issues/788)). The email was built from the relay's configured address, while the dialog rebuilt the link from whatever address your browser was on — so on the Vite dev server it copied `localhost:3001`, and an admin working on the relay Mac copied `localhost:4000`. The dialog now shows the relay's link. The same applies to "Copy link to comment" and to the relay address in the agent command under Settings → Tokens: with `TAPFLOW_RELAY_URL` (or `relay.url`) set, all three use it. With nothing set they keep your browser's address, except that a browser on `localhost` gets the relay's LAN address, which the agent command already did. The invite response gains an `inviteUrl` field, `null` when the relay has no address a teammate can open.

**A tunnel's address is the one it actually got** ([#794](https://github.com/jo-duchan/tapflow/issues/794)). Choosing Tailscale in `tapflow init` leaves `publicUrl` empty and `tapflow start` detects the MagicDNS name, but only the startup banner ever used it — invitations still pointed at `localhost:4000`. The tunnel now starts before the relay and hands over what it got, so invitations, dashboard links and the CORS allowlist use the detected address, and a tunnel that fails to start no longer leaves its configured address in any of them. A tunnel address is for teammates' browsers: the agent command uses `relay.url`, never the tunnel, so an agent on the relay's own network does not stream through it. If the port is already taken, the command now stops before touching the tunnel, rather than restarting a running instance's rathole server on its way to failing.

**Running the relay image without `TAPFLOW_RELAY_URL` is said out loud.** The relay logs a warning at startup when it runs in a container with no address a teammate can open, since invitations then point at `localhost`. Inside a container it also stops offering its bridge address (such as `172.17.0.2`) as the LAN address for the agent command.

**The invite dialog no longer claims a copy that did not happen.** It said "copied" even when the browser refused, and on a plain-HTTP page, which has no clipboard API, it reported the invitation itself as failed.
