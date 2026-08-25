// ===== Canonical Role Snapshot API =====
//
// Read/write API for the SysOp-only Admin management surface.
// Uses append-only qucp-rs-* role snapshots. The only assignable role is
// 'admin'; removing an admin removes that member from the next snapshot.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { requestQortium } from '../../services/qortium/qortiumClient';
import { buildRoleSnapshotIdentifier } from '../../services/qdn/identifiers/roleSnapshotIdentifiers';
import {
  fetchValidatedRoleSnapshots,
  getCachedRoleSnapshot,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { requireCurrentRoleSnapshotForMutation } from '../../services/qdn/runtime/roleSnapshotRuntime';
import {
  createAdminAssignmentSnapshot,
  createAdminRemovalSnapshot,
  isValidWalletAddress,
  listAdminAddresses,
} from '../../services/qdn/roles/roleSnapshotMutation';
import { QUC_SYSOP_ADDRESS } from '../../config/qortiumTrust';
import type { QucpRoleRegistrySnapshot } from '../../services/qdn/schemas/roleRegistrySnapshotSchema';

export interface RoleSnapshotResult {
  snapshot: QucpRoleRegistrySnapshot | null;
  adminAddresses: string[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
}

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try {
    return { data: await fn() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed.' };
  }
};

function requireSysOp(actorAddress: string): void {
  if (actorAddress !== QUC_SYSOP_ADDRESS) {
    throw new Error('Only SysOp can assign or remove Admins.');
  }
}

async function verifyCurrentAccountIsSysOp(): Promise<void> {
  const raw = await requestQortium<unknown>({ action: 'GET_SELECTED_ACCOUNT' });
  const account = raw as Record<string, unknown>;
  const currentAddress = typeof account.address === 'string' ? account.address : '';
  if (currentAddress !== QUC_SYSOP_ADDRESS) {
    throw new Error('The selected account is not the SysOp trust anchor.');
  }
}

function generateSnapshotId(): string {
  return `rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const roleApi = createApi({
  reducerPath: 'roleApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['RoleSnapshot'],
  endpoints: (builder) => ({
    getRoleSnapshot: builder.query<RoleSnapshotResult, void>({
      queryFn: () => queryFn(async () => {
        const result = await fetchValidatedRoleSnapshots();
        const snapshot = getCachedRoleSnapshot();
        const completeness: RoleSnapshotResult['completeness'] =
          result.status === 'unavailable'
            ? 'unavailable'
            : result.status === 'empty'
              ? 'empty'
              : snapshot
                ? result.status === 'incomplete'
                  ? 'incomplete'
                  : 'complete'
                : 'incomplete';

        return {
          snapshot,
          adminAddresses: snapshot ? listAdminAddresses(snapshot) : [],
          completeness,
        };
      }),
      providesTags: ['RoleSnapshot'],
    }),

    assignAdmin: builder.mutation<
      QucpRoleRegistrySnapshot,
      { actorAddress: string; targetAddress: string; targetDisplayName?: string }
    >({
      queryFn: (input) => queryFn(async () => {
        requireSysOp(input.actorAddress);
        await verifyCurrentAccountIsSysOp();
        if (input.targetAddress === QUC_SYSOP_ADDRESS) {
          throw new Error('SysOp is the trust anchor and cannot be reassigned through this UI.');
        }
        if (!isValidWalletAddress(input.targetAddress)) {
          throw new Error('Invalid Qortium wallet address.');
        }

        const roleResult = await fetchValidatedRoleSnapshots();
        const current = requireCurrentRoleSnapshotForMutation(roleResult);
        const snapshotId = generateSnapshotId();
        const payload = createAdminAssignmentSnapshot(
          current,
          snapshotId,
          input.targetAddress,
          input.targetDisplayName?.trim() || undefined,
        );

        await publishJsonResource({
          service: 'DOCUMENT',
          identifier: await buildRoleSnapshotIdentifier(snapshotId),
          payload,
          title: `Role snapshot ${snapshotId}`,
          filename: `${snapshotId}.json`,
        });

        return payload;
      }),
      invalidatesTags: ['RoleSnapshot'],
    }),

    removeAdmin: builder.mutation<
      QucpRoleRegistrySnapshot,
      { actorAddress: string; targetAddress: string }
    >({
      queryFn: (input) => queryFn(async () => {
        requireSysOp(input.actorAddress);
        await verifyCurrentAccountIsSysOp();
        if (!isValidWalletAddress(input.targetAddress)) {
          throw new Error('Invalid Qortium wallet address.');
        }

        const roleResult = await fetchValidatedRoleSnapshots();
        const current = requireCurrentRoleSnapshotForMutation(roleResult);
        const snapshotId = generateSnapshotId();
        const payload = createAdminRemovalSnapshot(
          current,
          snapshotId,
          input.targetAddress,
        );

        await publishJsonResource({
          service: 'DOCUMENT',
          identifier: await buildRoleSnapshotIdentifier(snapshotId),
          payload,
          title: `Role snapshot ${snapshotId}`,
          filename: `${snapshotId}.json`,
        });

        return payload;
      }),
      invalidatesTags: ['RoleSnapshot'],
    }),
  }),
});

export const {
  useGetRoleSnapshotQuery,
  useAssignAdminMutation,
  useRemoveAdminMutation,
} = roleApi;
