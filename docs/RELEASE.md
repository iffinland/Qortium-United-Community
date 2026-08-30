# Qortium United Community Release and Deployment Runbook

## Target and provenance

The recorded application target is
`qdn://APP/Qortium-Unified-Community/Community-Portal`. The exact build currently
published there is unverified. Target identity is not permission to overwrite
it.

## Required authority

Commit, push, tag, release, signing, deployment, transactions, and QDN
publication require explicit owner authorization for the exact source and
target. Preserve existing users/data and owner changes.

## Pre-release gates

1. Record Git branch, HEAD, origin relation, and complete working tree.
2. Confirm package/changelog version, live target, publisher authority, SysOp
   trust anchor, `qucp-*` namespace, and intended Home/Core environment.
3. Resolve or explicitly accept current known limitations and security/data
   integrity findings.
4. Run:

   ```bash
   npm ci
   npm run test
   npm run build
   npm run lint
   git diff --check
   ```

5. Inspect `dist/`, relative assets, and unintended sensitive/generated files.
6. Create a deterministic artifact and record source commit plus SHA-256. This
   repository currently has no canonical artifact/publication command; do not
   invent one inside a release session.

## Deployment validation

Publish only through an owner-approved Home/QDN workflow. Record the actual
transaction/resource reference and artifact provenance. In the deployed app,
validate startup, direct/refresh routes, selected-account/name transitions,
Home text size (without app-owned zoom), role-history degradation, authorized
and unauthorized writes, publication confirmation/readback, media, and every
changed domain lifecycle.

Tests/builds do not prove embedded or deployed compatibility. Keep status at
owner-live-validation-required until required live checks pass.
