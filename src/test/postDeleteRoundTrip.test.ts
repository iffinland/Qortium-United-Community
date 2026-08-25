// ===== Post Delete (Owner Tombstone) Write/Read Round-Trip =====

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../store';
import { qortiumApi } from '../store/api/qortiumApi';
import {
  queryTombstones,
  buildTombstonePayload,
  buildTombstoneComposition,
} from '../services/qdn/runtime/tombstoneRuntime';
import { buildOwnerTombstoneIdentifier } from '../services/qdn/identifiers/operationIdentifiers';
import { ownerTombstonePolicy } from '../services/qdn/policies/ownerTombstonePolicy';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

describe('post delete production round-trip', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(qortiumApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    bridge.cleanup();
  });

  it('delete publishes a canonical owner tombstone under the post family', async () => {
    const result = await store.dispatch(
      qortiumApi.endpoints.deletePost.initiate({
        postId: 'p1234567890',
        ownerName: 'iffi_vaba_mees',
        ownerAddress: QUC_SYSOP_ADDRESS,
      }),
    );

    expect(result).toHaveProperty('data');
    expect(bridge.published).toHaveLength(1);
    const published = bridge.published[0];
    expect(published.service).toBe('DOCUMENT');
    expect(published.identifier).toMatch(/^qucp-ot-[a-f0-9]{26}-[a-f0-9]{26}$/);
    expect(published.payload.resourceFamily).toBe('qucp-owner-tombstone');
    expect(published.payload.targetFamily).toBe('qucp-post');
    expect(published.payload.targetEntityId).toBe('p1234567890');
    expect(published.payload.action).toBe('delete');

    const policyParse = ownerTombstonePolicy.parse(published.payload);
    expect(policyParse.success).toBe(true);
  });

  it('canonical tombstone reader accepts and hides the deleted post', async () => {
    const targetEntityId = 'p1234567890';
    const ownerName = 'iffi_vaba_mees';
    const ownerAddress = QUC_SYSOP_ADDRESS;
    const payload = buildTombstonePayload({
      operationId: 'ot-p1234567890-1234567890',
      targetFamily: 'qucp-post',
      targetEntityId,
      ownerName,
      ownerAddress,
      action: 'delete',
      now: 1787402932864,
    });
    const identifier = await buildOwnerTombstoneIdentifier(
      'qucp-post',
      targetEntityId,
      ownerAddress,
    );

    const result = await queryTombstones(
      async () => [{ name: ownerName, service: 'DOCUMENT', identifier, created: 1787402934251, updated: 1787402934251 }],
      async () => payload,
      new IdentityResolver(async () => ownerAddress),
    );

    expect(result.status).toBe('complete');
    expect(result.items).toHaveLength(1);

    const composition = buildTombstoneComposition(result);
    const state = composition.getEffectiveState('qucp-post', targetEntityId, {
      ownerName,
      ownerAddress,
      entityId: targetEntityId,
      resourceFamily: 'qucp-post',
    });
    expect(state.state).toBe('deleted-by-owner');
  });

  it('foreign or malformed tombstone is ignored and leaves the post active', async () => {
    const payload = buildTombstonePayload({
      operationId: 'ot-foreign',
      targetFamily: 'qucp-post',
      targetEntityId: 'p1234567890',
      ownerName: 'iffi_vaba_mees',
      ownerAddress: QUC_SYSOP_ADDRESS,
      action: 'delete',
      now: 1787402932864,
    });

    const result = await queryTombstones(
      async () => [{ name: 'OtherUser', service: 'DOCUMENT', identifier: 'qucp-ot-invalid', created: 1787402934251, updated: 1787402934251 }],
      async () => payload,
      new IdentityResolver(async () => 'QOtherUserOtherUserOtherUserOtherUser'),
    );

    const composition = buildTombstoneComposition(result);
    const state = composition.getEffectiveState('qucp-post', 'p1234567890', {
      ownerName: 'iffi_vaba_mees',
      ownerAddress: QUC_SYSOP_ADDRESS,
      entityId: 'p1234567890',
      resourceFamily: 'qucp-post',
    });
    expect(state.state).toBe('active');
  });

  it('active feed reader hides a tombstoned post', async () => {
    const targetEntityId = 'p1234567890';
    const ownerName = 'iffi_vaba_mees';
    const ownerAddress = QUC_SYSOP_ADDRESS;
    const postPayload = {
      schemaVersion: 1,
      resourceFamily: 'qucp-post',
      entityId: targetEntityId,
      title: 'Delete me',
      content: 'Content',
      summary: 'Content',
      tags: [],
      ownerName,
      ownerAddress,
      createdAt: 1787402915021,
    };
    const tombstonePayload = buildTombstonePayload({
      operationId: `ot-${targetEntityId}-1234567890`,
      targetFamily: 'qucp-post',
      targetEntityId,
      ownerName,
      ownerAddress,
      action: 'delete',
      now: 1787402932864,
    });
    const tombstoneIdentifier = await buildOwnerTombstoneIdentifier(
      'qucp-post',
      targetEntityId,
      ownerAddress,
    );

    bridge.setFetch(
      `DOCUMENT/${ownerName}/${`qucp-post-${targetEntityId}`}`,
      postPayload,
    );
    bridge.setFetch(
      `DOCUMENT/${ownerName}/${tombstoneIdentifier}`,
      tombstonePayload,
    );

    const anyGlobal = globalThis as typeof globalThis & { qdnRequest?: unknown };
    const anyWindow = window as Window & { qdnRequest?: unknown };
    anyGlobal.qdnRequest = async (payload: Record<string, unknown>) => {
      if (payload.action === 'GET_SELECTED_ACCOUNT') return { address: ownerAddress, name: ownerName };
      if (payload.action === 'GET_ACCOUNT_NAMES') return [ownerName];
      if (payload.action === 'GET_NAME_DATA') return { owner: ownerAddress, ownerAddress };
      if (payload.action === 'SEARCH_QDN_RESOURCES') {
        const identifier = payload.identifier as string;
        if (identifier === 'qucp-post-') {
          return [{ name: ownerName, service: 'DOCUMENT', identifier: `qucp-post-${targetEntityId}`, created: 1787402917215, updated: 1787402917215 }];
        }
        if (identifier === 'qucp-ot-') {
          return [{ name: ownerName, service: 'DOCUMENT', identifier: tombstoneIdentifier, created: 1787402934251, updated: 1787402934251 }];
        }
        return [];
      }
      if (payload.action === 'FETCH_QDN_RESOURCE') {
        const key = `${payload.service}/${payload.name}/${payload.identifier}`;
        if (key === `DOCUMENT/${ownerName}/${`qucp-post-${targetEntityId}`}`) return postPayload;
        if (key === `DOCUMENT/${ownerName}/${tombstoneIdentifier}`) return tombstonePayload;
        return null;
      }
      if (payload.action === 'PUBLISH_QDN_RESOURCE') return { success: true };
      return undefined;
    };
    anyWindow.qdnRequest = anyGlobal.qdnRequest as typeof anyWindow.qdnRequest;

    const result = await store.dispatch(qortiumApi.endpoints.getPosts.initiate());
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Array<{ id: string }>).some((p) => p.id === targetEntityId)).toBe(false);
  });

  it('unauthorized delete publishes zero resources', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge();
    const anyGlobal = globalThis as typeof globalThis & { qdnRequest?: unknown };
    const anyWindow = window as Window & { qdnRequest?: unknown };
    anyGlobal.qdnRequest = async (payload: Record<string, unknown>) => {
      if (payload.action === 'PUBLISH_QDN_RESOURCE') return false;
      if (payload.action === 'GET_SELECTED_ACCOUNT') return { address: 'QOtherUserOtherUserOtherUserOtherUser', name: 'OtherUser' };
      if (payload.action === 'GET_ACCOUNT_NAMES') return ['OtherUser'];
      if (payload.action === 'GET_NAME_DATA') return { owner: 'QOtherUserOtherUserOtherUserOtherUser' };
      if (payload.action === 'SEARCH_QDN_RESOURCES') return [];
      return undefined;
    };
    anyWindow.qdnRequest = anyGlobal.qdnRequest as typeof anyWindow.qdnRequest;

    const result = await store.dispatch(
      qortiumApi.endpoints.deletePost.initiate({
        postId: 'p1234567890',
        ownerName: 'iffi_vaba_mees',
        ownerAddress: QUC_SYSOP_ADDRESS,
      }),
    );

    // The endpoint attempts publication; the bridge refuses it, so it must not
    // report success.
    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });
});
