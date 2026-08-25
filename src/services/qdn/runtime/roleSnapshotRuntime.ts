// ===== Role Snapshot Runtime =====
//
// Minimal runtime for fetching and selecting the current authoritative
// role snapshot from QDN via the validated query pipeline.
//
// Used by support category authorization to verify admin/SysOp roles.

import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import type { ValidatedRuntimeQueryResult } from './runtimeTypes';
import { paginatedQdnSearch } from '../paginatedQdnSearch';
import { boundedFetchResources } from '../fetchQdnResources';
import { validateResource } from '../validationPipeline';
import { roleSnapshotPolicy } from '../policies/roleSnapshotPolicy';
import { buildRoleSnapshotSearchPrefix } from '../identifiers/roleSnapshotIdentifiers';
import { selectCurrentSnapshot, type SnapshotSelection } from '../roles/registrySnapshotSelection';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import {
  classifyRuntimeQuery,
  type ValidatedResource,
  type RuntimeDiagnostic,
} from './runtimeTypes';
import { ValidationReasonCodes } from '../validationTypes';

// ---- Query Result Type ----

export type RoleSnapshotQueryResult = ValidatedRuntimeQueryResult<QucpRoleRegistrySnapshot>;

// ---- Payload Parser ----

function parseRoleSnapshotPayload(raw: unknown): QucpRoleRegistrySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-role-snapshot') return null;
  return d as QucpRoleRegistrySnapshot;
}

// ---- Query Function ----

export async function queryRoleSnapshots(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
): Promise<RoleSnapshotQueryResult> {
  const diagnostics: RuntimeDiagnostic[] = [];

  const searchResult = await paginatedQdnSearch(searchFn, {
    service: 'DOCUMENT',
    identifier: buildRoleSnapshotSearchPrefix(),
    prefix: true,
    pageSize: 50,
    safetyMax: 500,
    reverse: true,
    includeMetadata: true,
  });

  if (
    searchResult.reason === 'request-failed' ||
    searchResult.reason === 'invalid-response' ||
    searchResult.reason === 'timeout'
  ) {
    diagnostics.push({
      level: 'error',
      code: 'ROLE_SNAPSHOT_SEARCH_FAILED',
      message: `Role snapshot search failed: ${searchResult.reason}`,
    });
    return {
      status: 'unavailable',
      items: [],
      reason: `Role snapshot search failed: ${searchResult.reason}`,
      diagnostics,
    };
  }

  if (searchResult.items.length === 0) {
    if (searchResult.complete) {
      return { status: 'empty', items: [], diagnostics: [] };
    }
    return {
      status: 'incomplete',
      items: [],
      rejectedCount: 0,
      quarantinedCount: 0,
      reason: searchResult.reason ?? 'Incomplete role snapshot discovery',
      diagnostics: searchResult.diagnostics.map((d) => ({
        level: d.level,
        code: d.code,
        message: d.message,
      })),
    };
  }

  for (const d of searchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  const fetchResult = await boundedFetchResources<QucpRoleRegistrySnapshot>(
    fetchFn,
    parseRoleSnapshotPayload,
    searchResult.items,
  );

  for (const d of fetchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  const items: ValidatedResource<QucpRoleRegistrySnapshot>[] = [];
  let rejectedCount = 0;
  let quarantinedCount = 0;
  let identityLookupFailedCount = 0;

  for (const envelope of fetchResult.items) {
    const result = await validateResource(envelope, roleSnapshotPolicy, identityResolver);

    if (result.status === 'accepted') {
      items.push({
        envelope: result.envelope,
        entityId: result.envelope.data.snapshotId,
        publisherName: result.envelope.metadata.name,
        publisherAddress:
          result.envelope.resolvedPublisherAddress ??
          result.envelope.data.sysopAddress,
      });
      continue;
    }

    if (result.status === 'rejected') {
      rejectedCount++;
    } else {
      quarantinedCount++;
      if (result.reason === ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED) {
        identityLookupFailedCount++;
      }
    }

    for (const d of result.diagnostics) {
      diagnostics.push({
        level: d.level,
        code: d.code,
        message: d.message,
        entityId: d.identifier,
        publisherName: d.name,
      });
    }
  }

  const searchComplete = searchResult.complete;
  const fetchComplete = fetchResult.complete;
  const allFetchesFailed =
    searchResult.items.length > 0 &&
    fetchResult.items.length === 0 &&
    !fetchComplete;

  return classifyRuntimeQuery({
    items,
    rejectedCount,
    quarantinedCount,
    identityLookupFailedCount,
    searchComplete,
    searchReason: searchResult.reason,
    fetchComplete,
    allFetchesFailed,
    diagnostics,
  });
}

// ---- Latest Snapshot Selector ----

/**
 * Get the current authoritative role snapshot from a validated query result.
 *
 * Returns the latest accepted snapshot according to deterministic lineage
 * selection, or null if no snapshot is available.
 */
export function getLatestRoleSnapshot(
  result: RoleSnapshotQueryResult,
): QucpRoleRegistrySnapshot | null {
  // Only a complete discovery may resolve the current authoritative snapshot.
  // `unavailable`, `empty`, and `incomplete` all fail closed here: an
  // incomplete discovery can contain a non-empty, internally-linear prefix
  // that nevertheless omits a later revocation or the true canonical head.
  // Selecting that prefix head would fabricate authoritative current-role
  // state from partial evidence.
  if (result.status !== 'complete') {
    return null;
  }

  const envelopes = result.items.map((item) => item.envelope);

  const selection: SnapshotSelection = selectCurrentSnapshot(envelopes);

  if (selection.status === 'available' || selection.status === 'last-known-good') {
    return selection.snapshot.envelope.data;
  }

  return null;
}

/**
 * Return the single unambiguous authoritative current role snapshot required
 * to safely publish the next snapshot, or throw a fail-closed error.
 *
 * This is stricter than `getLatestRoleSnapshot`: it never falls back to a
 * last-known-good cache and never tolerates incomplete/ambiguous lineage. It
 * also refuses to synthesize a new genesis from an empty registry, so a
 * transient discovery failure cannot silently rebuild authority.
 */
export function requireCurrentRoleSnapshotForMutation(
  result: RoleSnapshotQueryResult,
): QucpRoleRegistrySnapshot {
  if (result.status === 'unavailable') {
    throw new Error('Role registry is unavailable. Refusing to mutate roles.');
  }

  if (result.status === 'empty') {
    throw new Error('No role snapshots found. Refusing to create a new role lineage.');
  }

  if (result.status === 'incomplete') {
    throw new Error('Role registry discovery is incomplete. Refusing to mutate roles.');
  }

  if (result.items.length === 0) {
    throw new Error('No accepted role snapshots found. Refusing to mutate roles.');
  }

  const envelopes = result.items.map((item) => item.envelope);
  const selection = selectCurrentSnapshot(envelopes);

  if (selection.status !== 'available') {
    if (selection.status === 'history-unresolved') {
      throw new Error(`Role lineage is ambiguous: ${selection.reason}`);
    }
    throw new Error(`No authoritative current role snapshot available: ${selection.reason}`);
  }

  return selection.snapshot.envelope.data;
}
