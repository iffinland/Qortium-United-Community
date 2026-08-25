# Qortium United Community — Roadmap

This file separates implemented first-BETA scope from intentionally deferred
and future work. It is current documentation, not a historical report.

## Implemented in `0.1.0-beta.1`

- Qortium Home authentication with canonical `SysOp` / `Admin` / `User` roles;
- append-only, SysOp-anchored role registry and Admin membership management;
- shared Admin-managed state across community domains;
- posts and comments on the validated QDN runtime;
- RichText content and QDN-hosted images;
- forum topics and replies;
- support categories, tickets, replies, and the permanent Closed lifecycle;
- polls and voting with deterministic result derivation;
- projects with lifecycle transitions;
- wiki articles;
- events with derived temporal status;
- global deep search across community domains with degradation awareness;
- dashboard counters, Recent Activity, and Active Forum Discussions;
- canonical QDN runtime and Qortium Home/Core integration with explicit
  read-state classification and deterministic publication readback.

## Deferred to post-BETA (known limitations, not blockers)

These are recorded with detail in
[`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md).

- MEDIUM: concurrent account-refresh ordering race (`M3`);
- MEDIUM: creator-bound Post delete/restore and Poll close lifecycle controls
  (`M5`);
- LOW: no explicit React wildcard / Not Found route;
- LOW: Node-engine / dependency advisory debt;
- LOW: legacy markdown link policy not fully unified with canonical RichText
  policy;
- LOW: dormant obsolete role/moderation vocabulary cleanup.

## Future / post-BETA product work

- Donate redesign (deferred);
- owner-collected UX and minor bug notes (deferred to post-BETA development);
- completing the public donation/funding product vision; the current
  implementation is a Core-authoritative wallet-activity baseline, not the full
  funding subsystem;
- removal/isolation of dormant moderation vocabulary that is not part of the
  intended product.

## Explicitly out of scope for this release

No new features were added during BETA release preparation, and no deferred
MEDIUM/LOW findings were fixed. This release is documentation/version
preparation plus validation only.
