# Changelog

All notable changes to Qortium United Community are documented here. The format
follows a lightweight version/date/detail structure.

## `0.1.0-beta.1` — 2026-08-25

### First BETA

This is the first official BETA of Qortium United Community. The independent
pre-BETA release gate passed with **BLOCKER 0 / HIGH 0** for the authorized
release scope.

### Major functional domains

- authentication and authorization with canonical `SysOp` / `Admin` / `User`
  roles backed by an append-only role registry;
- posts and comments;
- RichText content and QDN-hosted images;
- forum topics and replies;
- support categories, tickets, replies, and the permanent Closed lifecycle;
- polls and voting;
- projects;
- wiki articles;
- events;
- global deep search;
- Admin management;
- dashboard counters, Recent Activity, and Active Forum Discussions.

### QDN-native architecture

The application is Qortium-native: community data is published to and read from
Qortium QDN resources through the Qortium Home bridge, with a publisher-aware
validated runtime, strict resource-family schemas/policies, deterministic
authoritative ordering, and validated identity/name resolution. There is no
centralized backend or database.

### Shared Admin-state model

Admin-managed domains share one fail-closed authority model. Reads preserve the
role-authority dependency, so incomplete or unavailable role history cannot be
reported as authoritative empty state or grant ordinary Admin authority.

### Deterministic lifecycle and readback improvements

- role snapshots form a validated append-only lineage with a single genesis and
  canonical head;
- current-role resolution fails closed on incomplete, unavailable, empty, or
  ambiguous lineage;
- publication readback distinguishes accepted-but-unconfirmed writes from
  confirmed persistence;
- support tickets enforce a permanent Closed lifecycle boundary on the
  authoritative read path.

### Search, dashboard, events, and support

Global deep search aggregates community domains while preserving per-domain
degradation state. The dashboard surfaces counters, Recent Activity, and Active
Forum Discussions. Events derive temporal status rather than storing it. Support
categories and tickets round-trip through the validated QDN runtime.

### Security and data-integrity hardening

The BETA closes the residual HIGH findings from the independent pre-BETA audit:
incomplete current-role discovery now fails closed, and zero-resource
Admin-domain discovery preserves the role-authority dependency. Direct-QDN
adversarial paths were added for unauthorized and degraded authority cases.

### Known limitations and deferred items

Accepted MEDIUM and LOW findings remain deferred and are documented in
[`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md). Donate redesign and
general UX/polish notes remain post-BETA work.

### Release gate

- BLOCKER: 0
- HIGH: 0

Final owner-visible runtime confirmation in Qortium Home is a remaining owner
validation step; this repository build is not itself a live deployment.
