# Known Limitations and Deferred Work

This is the technical reference for the accepted post-BETA items that remain
deferred for Qortium United Community `0.1.0-beta.1`. These are known
limitations, not release blockers, and were not fixed during release
preparation.

## MEDIUM

### M3 — concurrent account-refresh ordering race

Authentication is initialized once, and publisher-name/role caches were
historically not keyed against the selected account. An account switch that
coincides with an in-flight refresh can briefly expose the previous account's
role or publisher name until the next refresh/cache expiry. The account-change
listener now invalidates account-scoped caches and re-initializes auth, but the
underlying concurrent ordering race remains deferred for a dedicated post-BETA
fix.

### M5 — creator-bound Post delete/restore and Poll close lifecycle controls

Creator-bound controls for Post delete/restore and Poll close are not yet fully
consistent with the owner-visible lifecycle contract. The current behavior is
functional for the BETA but requires a dedicated post-BETA pass to make the
creator/Admin boundaries and lifecycle controls fully coherent.

## LOW

### No explicit React wildcard / Not Found route

Unknown application paths are not routed to an explicit Not Found page. The
server fallback returns HTTP 200 and the shared layout renders, but there is no
dedicated wildcard route or user-facing Not Found content.

### Node-engine / dependency advisory debt

The dependency toolchain reports advisory debt (for example through the Vite
toolchain and React Router) and an engine-version warning. No exploitable
production path was confirmed in this client-only application. Upgrade and
retest work is deferred to post-BETA maintenance.

### Legacy markdown link policy not fully unified

The legacy markdown link renderer blocks several dangerous schemes but does not
apply the canonical RichText link whitelist to every scheme and
protocol-relative URL. No raw HTML execution path was found; unifying the two
link policies is deferred.

### Dormant obsolete role/moderation vocabulary

Obsolete `moderator`/`support`/reopen vocabulary and dormant moderation
schemas/reducers remain in non-production code. Active production authorization
resolves only `SysOp`, `Admin`, and `User`, and no obsolete privilege path was
found. Cleanup or isolation is deferred; obsolete roles must not be restored.

## Other deferred product work

- Donate redesign is deferred.
- Owner-collected UX and minor bug notes are deferred to post-BETA development.
- The public donation/funding product vision remains future work; the current
  implementation is a Core-authoritative wallet-activity baseline, not the full
  funding subsystem.
