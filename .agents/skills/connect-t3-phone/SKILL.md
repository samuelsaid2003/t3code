---
name: connect-t3-phone
description: Pair or reconnect a real iPhone or other physical phone to the installed T3 Code Samuel desktop environment, including refreshing one-time pairing credentials and selecting a reachable Tailscale, T3 Connect, or LAN endpoint. Use when the user's phone lost its T3S connection, an environment was deleted, a pairing code expired, or the saved host is unreachable. Do not use for iOS Simulator or Android Emulator testing.
---

# Connect T3 Phone

Connect a physical phone to the user's installed **T3 Code (Samuel)** environment. This is an operational pairing workflow, not mobile application development; use [`test-t3-mobile`](../test-t3-mobile/SKILL.md) for simulators and emulators.

## Preserve the correct environment

- Target **T3 Code (Samuel)** (`com.samuelsaid.t3code`) and its production home `~/.t3-samuel`.
- Do not use T3 Code Alpha (`com.t3tools.t3code`, `~/.t3`) or the repo-local Dev environment unless the user explicitly names one of them.
- Pairing creates an authentication session only. Do not import, migrate, edit, or delete projects, threads, provider sessions, or SQLite state.
- Treat pairing URLs and codes as short-lived secrets. Show a requested credential to the user, but do not save it in files, screenshots, commits, or durable notes.

Read [`docs/user/remote-access.md`](../../../docs/user/remote-access.md) when endpoint selection, Tailscale Serve, T3 Connect, or network exposure needs troubleshooting.

## Establish a reachable host

1. Determine whether the phone is on the same LAN, on the user's tailnet, or connecting through T3 Connect. If the user is away from the Mac, do not offer a `127.0.0.1`, `localhost`, or home-LAN-only URL.
2. Prefer the already configured T3 Connect or Tailscale endpoint. A Tailnet `100.x.y.z` address is valid only while both devices are connected to the same tailnet. Prefer the Tailscale HTTPS/MagicDNS endpoint when a hosted HTTPS client requires it.
3. In **T3 Code (Samuel)**, open **Settings → Connections → This environment**. Confirm Network access is enabled and inspect the endpoint list rather than assuming a port or stale address.
4. Use read-only network checks when useful. Do not reconfigure Tailscale Serve or restart the desktop backend unless the selected endpoint requires it and the user has authorized the change.

When UI operation is needed, ask for Computer Use permission, then load and follow the `computer-use` skill. Use the app's accessibility tree and current visible state rather than remembered coordinates.

## Create or refresh the credential

1. Use **Create Link** or the equivalent pairing action for the selected reachable endpoint.
2. Give the user either the complete pairing link/QR code or the exact Host and Pairing Code fields required by the phone.
3. Pairing credentials are single-use. If a credential was attempted, expired, consumed, or the environment was accidentally deleted after pairing, create a new credential instead of retrying the old one.
4. Keep the host and code from the same pairing link. An otherwise valid code presented to a different server is reported as an invalid environment credential.

Prefer the running desktop app's pairing UI because it reflects its real backend port and endpoint configuration. If that UI is unavailable, follow the repository's documented `t3 pair` flow against the exact running Samuel environment; first prove the target is `~/.t3-samuel`, and never start a second server against its live database.

## Verify the outcome

- Confirm the phone shows the Samuel environment as connected and can list its expected projects or threads.
- If the credential is rejected, check endpoint reachability and target identity before minting one fresh credential. Do not repeatedly issue codes without changing the failed condition.
- Leave existing authenticated phone sessions in place unless the user explicitly asks to revoke or replace them.
- Report which endpoint type was used and whether the phone connected. Do not repeat an already consumed credential in the final response.
