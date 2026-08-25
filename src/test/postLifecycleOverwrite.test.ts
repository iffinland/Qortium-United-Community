// ===== Post Delete/Restore QDN Overwrite Consistency =====
//
// The owner-tombstone operation model uses a deterministic coordinate keyed by
// (target, owner). Delete and restore republish that same coordinate, so QDN
// exposes only the latest action. The reducer treats the latest action as the
// current state, which is already overwrite-consistent and does not depend on
// retained operation history.

import { describe, expect, it } from 'vitest';
import {
  queryTombstones,
  buildTombstoneComposition,
  buildTombstonePayload,
} from '../services/qdn/runtime/tombstoneRuntime';
import { buildOwnerTombstoneIdentifier } from '../services/qdn/identifiers/operationIdentifiers';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const TARGET_ENTITY_ID = 'p1234567890';
const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';

describe('post delete/restore overwrite consistency', () => {
  it('latest restore action is canonical after delete then restore', async () => {
    const identifier = await buildOwnerTombstoneIdentifier(
      'qucp-post',
      TARGET_ENTITY_ID,
      OWNER,
    );
    const restore = buildTombstonePayload({
      operationId: 'ot-restore',
      targetFamily: 'qucp-post',
      targetEntityId: TARGET_ENTITY_ID,
      ownerName: OWNER_NAME,
      ownerAddress: OWNER,
      action: 'restore',
      now: 1700000200000,
    });

    const result = await queryTombstones(
      async () => [
        { name: OWNER_NAME, service: 'DOCUMENT', identifier, created: 1700000200000, updated: 1700000200000 },
      ],
      async () => restore,
      new IdentityResolver(async () => OWNER),
    );

    expect(result.status).toBe('complete');
    const composition = buildTombstoneComposition(result);
    const state = composition.getEffectiveState('qucp-post', TARGET_ENTITY_ID, {
      ownerName: OWNER_NAME,
      ownerAddress: OWNER,
      entityId: TARGET_ENTITY_ID,
      resourceFamily: 'qucp-post',
    });
    expect(state.state).toBe('restored');
  });

  it('latest delete action is canonical when no restore followed', async () => {
    const identifier = await buildOwnerTombstoneIdentifier(
      'qucp-post',
      TARGET_ENTITY_ID,
      OWNER,
    );
    const del = buildTombstonePayload({
      operationId: 'ot-delete',
      targetFamily: 'qucp-post',
      targetEntityId: TARGET_ENTITY_ID,
      ownerName: OWNER_NAME,
      ownerAddress: OWNER,
      action: 'delete',
      now: 1700000100000,
    });

    const result = await queryTombstones(
      async () => [
        { name: OWNER_NAME, service: 'DOCUMENT', identifier, created: 1700000100000, updated: 1700000100000 },
      ],
      async () => del,
      new IdentityResolver(async () => OWNER),
    );

    const composition = buildTombstoneComposition(result);
    const state = composition.getEffectiveState('qucp-post', TARGET_ENTITY_ID, {
      ownerName: OWNER_NAME,
      ownerAddress: OWNER,
      entityId: TARGET_ENTITY_ID,
      resourceFamily: 'qucp-post',
    });
    expect(state.state).toBe('deleted-by-owner');
  });
});
