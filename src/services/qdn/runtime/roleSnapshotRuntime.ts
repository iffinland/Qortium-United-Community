// ===== Role Snapshot Runtime =====
//
// Minimal runtime for fetching and selecting the current authoritative
// role snapshot from QDN via the validated query pipeline.
//
// Used by support category authorization to verify admin/SysOp roles.

import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import type { ValidatedRuntimeQueryResult } from './runtimeTypes';
import { validatedRuntimeQuery } from './validatedQueryRuntime';
import { roleSnapshotPolicy } from '../policies/roleSnapshotPolicy';
import { buildRoleSnapshotSearchPrefix } from '../identifiers/roleSnapshotIdentifiers';
import { selectCurrentSnapshot, type SnapshotSelection } from '../roles/registrySnapshotSelection';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';

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
  return validatedRuntimeQuery<QucpRoleRegistrySnapshot>(
    searchFn,
    fetchFn,
    parseRoleSnapshotPayload,
    roleSnapshotPolicy,
    identityResolver,
    {
      service: 'DOCUMENT',
      identifierPrefix: buildRoleSnapshotSearchPrefix(),
    },
  );
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
  if (result.status === 'unavailable' || result.status === 'empty') {
    return null;
  }

  const envelopes = result.items.map((item) => item.envelope);

  const selection: SnapshotSelection = selectCurrentSnapshot(envelopes);

  if (selection.status === 'available' || selection.status === 'last-known-good') {
    return selection.snapshot.envelope.data;
  }

  return null;
}
