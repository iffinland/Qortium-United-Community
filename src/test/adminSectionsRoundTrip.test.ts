// ===== Admin Section Management Round-Trips =====
//
// Focused production-path tests for the canonical management operations moved
// into the Admin panel: project lifecycle archive/edit, poll close, and the
// Admin Wiki list that must include archived articles.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { store } from '../store';
import { projectApi } from '../store/api/projectApi';
import { pollApi } from '../store/api/pollApi';
import { wikiApi } from '../store/api/wikiApi';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

const wikiMetadata = (entityId: string) => ({
  name: OWNER_NAME,
  service: 'DOCUMENT',
  identifier: `qucp-wiki-${entityId}`,
  created: 1700000000000,
  updated: 1700000000000,
});

const wikiPayload = (entityId: string, status: 'active' | 'archived') => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-wiki',
  entityId,
  categoryId: 'guides',
  title: entityId === 'wk-active1' ? 'Active article' : 'Archived article',
  slug: entityId,
  content: 'Body',
  summary: 'Summary',
  tags: [],
  ownerName: OWNER_NAME,
  ownerAddress: OWNER,
  createdAt: 1700000000000,
  revision: status === 'archived' ? 2 : 1,
  status,
});

describe('admin section management round-trips', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(projectApi.util.resetApiState());
    store.dispatch(pollApi.util.resetApiState());
    store.dispatch(wikiApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    bridge.cleanup();
  });

  it('archives a project through the canonical lifecycle', async () => {
    const result = await store.dispatch(
      projectApi.endpoints.updateProject.initiate({
        entityId: 'proj-archive-1',
        title: 'Old project',
        description: 'Description',
        status: 'archived',
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
        existingStatus: 'planned',
        existingOwnerName: OWNER_NAME,
        existingOwnerAddress: OWNER,
        existingCreatedAt: 1700000000000,
      }),
    );

    expect(result).toHaveProperty('data');
    const published = bridge.published.find(
      (item) => item.identifier === 'qucp-project-proj-archive-1',
    );
    expect(published).toBeDefined();
    expect(published?.payload.status).toBe('archived');
    expect(published?.payload.ownerAddress).toBe(OWNER);
    expect(published?.payload.editedAt).toBeTypeOf('number');
  });

  it('rejects a forbidden project lifecycle transition', async () => {
    const result = await store.dispatch(
      projectApi.endpoints.updateProject.initiate({
        entityId: 'proj-bad-transition',
        title: 'Bad transition',
        description: 'Description',
        status: 'completed',
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
        existingStatus: 'planned',
        existingOwnerName: OWNER_NAME,
        existingOwnerAddress: OWNER,
        existingCreatedAt: 1700000000000,
      }),
    );

    expect(result).toHaveProperty('error');
  });

  it('allows a cross-publisher project update by the selected Admin/SysOp', async () => {
    const result = await store.dispatch(
      projectApi.endpoints.updateProject.initiate({
        entityId: 'proj-foreign',
        title: 'Hijack',
        description: 'Description',
        status: 'active',
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
        existingStatus: 'planned',
        existingOwnerName: 'Eve',
        existingOwnerAddress: FOREIGN,
        existingCreatedAt: 1700000000000,
      }),
    );

    expect(result).toHaveProperty('data');
    const published = bridge.published.find(
      (item) => item.identifier === 'qucp-project-proj-foreign',
    );
    expect(published).toBeDefined();
    expect(published?.payload.ownerName).toBe(OWNER_NAME);
    expect(published?.payload.ownerAddress).toBe(OWNER);
  });

  it('closes a poll by publishing an isClosed snapshot', async () => {
    const create = await store.dispatch(
      pollApi.endpoints.createPoll.initiate({
        question: 'Admin poll?',
        options: [
          { optionId: 'po-a', label: 'Yes' },
          { optionId: 'po-b', label: 'No' },
        ],
        allowVoteChange: true,
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
      }),
    );

    expect(create).toHaveProperty('data');
    const pollEntityId = (create.data as { id: string }).id;

    const close = await store.dispatch(
      pollApi.endpoints.closePoll.initiate({
        pollEntityId,
        question: 'Admin poll?',
        options: [
          { optionId: 'po-a', label: 'Yes' },
          { optionId: 'po-b', label: 'No' },
        ],
        allowVoteChange: true,
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
      }),
    );

    expect(close).toHaveProperty('data');
    const closedPublish = bridge.published.find(
      (item) => item.identifier === `qucp-poll-${pollEntityId}` && item.payload.isClosed === true,
    );
    expect(closedPublish).toBeDefined();
  });

  it('wiki admin list includes both active and archived articles', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier !== 'qucp-wiki-') return [];
        return [wikiMetadata('wk-active1'), wikiMetadata('wk-archived1')];
      },
      fetch: (payload) => {
        const identifier = payload.identifier as string;
        if (identifier === 'qucp-wiki-wk-active1') return wikiPayload('wk-active1', 'active');
        if (identifier === 'qucp-wiki-wk-archived1') return wikiPayload('wk-archived1', 'archived');
        return null;
      },
    });

    const result = await store.dispatch(wikiApi.endpoints.getWikiAdminList.initiate());

    expect(result).toHaveProperty('data');
    const articles = (result.data as { articles: Array<{ entityId: string; status: string }> }).articles;
    expect(articles.map((article) => article.entityId).sort()).toEqual([
      'wk-active1',
      'wk-archived1',
    ]);
    expect(articles.find((article) => article.entityId === 'wk-archived1')?.status).toBe('archived');
  });
});
