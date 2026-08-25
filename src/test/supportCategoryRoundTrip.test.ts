// ===== Support Category Write/Read Round-Trip =====

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../store';
import { supportApi } from '../store/api/supportApi';
import {
  querySupportCategories,
  applyCategoryHistoricalAuthorization,
  SUPPORT_CATEGORY_SEARCH_PREFIX,
} from '../services/qdn/runtime/supportRuntime';
import { validateTicketCategoryForCreation } from '../services/qdn/runtime/ticketCategoryValidation';
import { supportCategorySchema } from '../services/qdn/schemas/supportCategorySchema';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

describe('support category production round-trip', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(supportApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    bridge.cleanup();
  });

  it('category creation publishes a canonical support category, not a post', async () => {
    const result = await store.dispatch(
      supportApi.endpoints.createCategory.initiate({
        name: 'General',
        description: 'General support',
        ownerName: 'iffi_vaba_mees',
        ownerAddress: QUC_SYSOP_ADDRESS,
      }),
    );

    expect(result).toHaveProperty('data');
    expect(bridge.published).toHaveLength(1);
    const published = bridge.published[0];
    expect(published.service).toBe('DOCUMENT');
    expect(published.identifier).toMatch(/^qucp-support-category-sc-/);
    expect(published.identifier).not.toMatch(/^qucp-post-/);
    expect(published.payload.resourceFamily).toBe('qucp-support-category');
    expect(published.payload.isActive).toBe(true);

    const parsed = supportCategorySchema.safeParse(published.payload);
    expect(parsed.success).toBe(true);
  });

  it('publication failure returns an error and publishes zero resources', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: () => [],
    });
    // Make the publish action itself fail.
    const failingBridge = {
      ...bridge,
      calls: bridge.calls,
      published: bridge.published,
    };
    const anyGlobal = globalThis as typeof globalThis & { qdnRequest?: unknown };
    const anyWindow = window as Window & { qdnRequest?: unknown };
    anyGlobal.qdnRequest = async (payload: Record<string, unknown>) => {
      if (payload.action === 'PUBLISH_QDN_RESOURCE') return false;
      if (payload.action === 'GET_SELECTED_ACCOUNT') return { address: QUC_SYSOP_ADDRESS, name: 'iffi_vaba_mees' };
      if (payload.action === 'GET_ACCOUNT_NAMES') return ['iffi_vaba_mees'];
      if (payload.action === 'GET_NAME_DATA') return { owner: QUC_SYSOP_ADDRESS };
      if (payload.action === 'SEARCH_QDN_RESOURCES') return [];
      return undefined;
    };
    anyWindow.qdnRequest = anyGlobal.qdnRequest as typeof anyWindow.qdnRequest;

    const result = await store.dispatch(
      supportApi.endpoints.createCategory.initiate({
        name: 'Broken',
        ownerName: 'iffi_vaba_mees',
        ownerAddress: QUC_SYSOP_ADDRESS,
      }),
    );

    expect(result).toHaveProperty('error');
    expect(failingBridge.published).toHaveLength(0);
  });

  it('canonical reader accepts an active SysOp category', async () => {
    const entityId = 'sc-category1';
    const identifier = `qucp-support-category-${entityId}`;
    const payload = {
      schemaVersion: 1,
      resourceFamily: 'qucp-support-category',
      entityId,
      name: 'Billing',
      description: 'Billing questions',
      isActive: true,
      sortOrder: 1,
      ownerName: 'iffi_vaba_mees',
      ownerAddress: QUC_SYSOP_ADDRESS,
      createdAt: 1787400991177,
    };

    const searchFn = async () => [
      { name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier, created: 1787400991177, updated: 1787400991177 },
    ];
    const fetchFn = async () => payload;
    const resolver = new IdentityResolver(async () => QUC_SYSOP_ADDRESS);

    const result = await querySupportCategories(
      searchFn as Parameters<typeof querySupportCategories>[0],
      fetchFn as Parameters<typeof querySupportCategories>[1],
      resolver,
    );

    expect(result.status).toBe('complete');
    expect(result.items).toHaveLength(1);

    const authorized = applyCategoryHistoricalAuthorization(result, [], false, true, undefined);
    expect(authorized.items).toHaveLength(1);

    const validation = validateTicketCategoryForCreation(entityId, authorized);
    expect(validation.valid).toBe(true);
  });

  it('archived category is excluded from new-ticket selection', async () => {
    const entityId = 'sc-archived1';
    const identifier = `qucp-support-category-${entityId}`;
    const payload = {
      schemaVersion: 1,
      resourceFamily: 'qucp-support-category',
      entityId,
      name: 'Archived',
      isActive: false,
      ownerName: 'iffi_vaba_mees',
      ownerAddress: QUC_SYSOP_ADDRESS,
      createdAt: 1787400991177,
    };

    const result = await querySupportCategories(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier, created: 1787400991177, updated: 1787400991177 }],
      async () => payload,
      new IdentityResolver(async () => QUC_SYSOP_ADDRESS),
    );

    const authorized = applyCategoryHistoricalAuthorization(result, [], false, true, undefined);
    const validation = validateTicketCategoryForCreation(entityId, authorized);
    expect(validation.valid).toBe(false);
    if (!validation.valid) expect(validation.reason).toBe('category-archived');
  });

  it('empty and unavailable discovery states remain distinct', async () => {
    const empty = await querySupportCategories(
      async () => [],
      async () => ({}),
      new IdentityResolver(async () => QUC_SYSOP_ADDRESS),
    );
    expect(empty.status).toBe('empty');

    const unavailable = await querySupportCategories(
      async () => { throw new Error('bridge down'); },
      async () => ({}),
      new IdentityResolver(async () => QUC_SYSOP_ADDRESS),
    );
    expect(unavailable.status).toBe('unavailable');
    expect(SUPPORT_CATEGORY_SEARCH_PREFIX).toBe('qucp-support-category-');
  });
});
