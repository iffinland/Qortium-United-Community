# Qortium United Community

Qortium United Community is a Qortium-native decentralized community
application. Content is published and read through Qortium QDN (Qortal Data
Network-compatible) resources and the Qortium Home bridge, rather than through a
centralized backend or database.

**Version:** `0.1.0-beta.1` (first official BETA)

## Status

This is the first BETA release. The independent pre-BETA release gate has
passed with **BLOCKER 0 / HIGH 0** for the authorized release scope. The
remaining accepted items are recorded as known limitations and deferred
post-BETA work, not release blockers.

The final owner-visible runtime confirmation in Qortium Home remains an owner
validation step; this repository build is not itself a live deployment.

## Feature scope

The BETA includes:

- Qortium Home authentication with `SysOp`, `Admin`, and `User` roles resolved
  from a canonical, append-only role registry;
- shared Admin-managed state across the community surfaces;
- posts and comments;
- RichText content and QDN-hosted images;
- forum topics and replies;
- support categories, tickets, replies, and the permanent Closed lifecycle;
- polls and voting;
- projects;
- wiki articles;
- events;
- global deep search across community domains;
- an Admin management surface (posts, support categories, projects, polls,
  events, wiki, and Admin membership);
- dashboard counters, Recent Activity, and Active Forum Discussions.

All user-visible community data is read from real Qortium/QDN paths; production
flows do not depend on mock or placeholder data.

## Architecture at a glance

- Publisher-aware, validated QDN runtime with strict resource-family schemas and
  policies;
- deterministic authoritative entity ordering and conflict reduction;
- validated identity and name-to-wallet resolution;
- owner tombstones for deletion, independent operations for reactions/votes, and
  append-only role snapshots for authority;
- explicit `complete` / `incomplete` / `unavailable` / `empty` read states so a
  partial or failed discovery is never silently reported as valid empty data;
- shared Admin-managed domain reads preserve the role-authority dependency even
  when a domain discovers zero resources;
- QDN publication confirmation that distinguishes accepted-but-unconfirmed writes
  from confirmed persistence.

## Development

```bash
npm ci
npm run build      # typecheck + production build
npm run lint
npm test           # Vitest suite
npm run dev        # local Vite dev server
```

### Qortium node endpoints

The canonical read-only Qortium Core API is:

```text
http://127.0.0.1:24891
```

Port `12391` is **Qortal**, not Qortium. Do not use `12391` for Qortium
live-node, Core, or QDN verification. Before relying on a fixed endpoint, verify
the actually reachable Qortium endpoint rather than silently assuming a port.
Live Qortium verification must be read-only unless an owner-authorized write is
explicitly in scope.

## Known limitations and deferred work

The accepted MEDIUM/LOW findings and intentionally deferred post-BETA work are
recorded in [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md). They are
known limitations, not release blockers.

## Roadmap

Implemented BETA scope versus future/post-BETA work is recorded in
[`ROADMAP.md`](ROADMAP.md).

## Release notes

The `0.1.0-beta.1` release notes are in [`CHANGELOG.md`](CHANGELOG.md).
