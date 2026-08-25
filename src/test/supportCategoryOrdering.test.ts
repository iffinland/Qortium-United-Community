// ===== Support Category Deterministic Ordering Regression =====

import { describe, expect, it } from 'vitest';
import { store } from '../store';
import { supportApi, sortSupportCategories } from '../store/api/supportApi';
import type { SupportCategory } from '../types/support';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';

function category(
  id: string,
  name: string,
  sortOrder: number,
  isActive = true,
): SupportCategory {
  return { id, name, isActive, sortOrder };
}

describe('support category ordering', () => {
  it('sorts negative, zero, and positive values deterministically with stable ties', () => {
    const input = [
      category('c-zero', 'Zero', 0),
      category('c-pos', 'Positive', 3),
      category('c-neg', 'Negative', -4),
      category('c-zero-b', 'Alpha', 0),
    ];

    const sorted = sortSupportCategories(input);

    expect(sorted.map((item) => item.id)).toEqual([
      'c-neg',
      'c-zero-b',
      'c-zero',
      'c-pos',
    ]);
  });

  it('updates and re-reads canonical category ordering through the production API', async () => {
    store.dispatch(supportApi.util.resetApiState());
    const bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-support-category-') {
          return [
            {
              name: OWNER_NAME,
              service: 'DOCUMENT',
              identifier: 'qucp-support-category-sc-last1',
              created: 1700000000000,
            },
            {
              name: OWNER_NAME,
              service: 'DOCUMENT',
              identifier: 'qucp-support-category-sc-first',
              created: 1700000000000,
            },
          ];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === 'qucp-support-category-sc-last1') {
          return {
            schemaVersion: 1,
            resourceFamily: 'qucp-support-category',
            entityId: 'sc-last1',
            name: 'Later',
            description: 'Later order',
            isActive: true,
            sortOrder: 5,
            ownerName: OWNER_NAME,
            ownerAddress: OWNER,
            createdAt: 1700000000000,
          };
        }
        if (payload.identifier === 'qucp-support-category-sc-first') {
          return {
            schemaVersion: 1,
            resourceFamily: 'qucp-support-category',
            entityId: 'sc-first',
            name: 'First',
            description: 'First order',
            isActive: true,
            sortOrder: -10,
            ownerName: OWNER_NAME,
            ownerAddress: OWNER,
            createdAt: 1700000000000,
          };
        }
        return null;
      },
    });

    try {
      const result = await store.dispatch(supportApi.endpoints.getCategories.initiate());
      expect(result).toHaveProperty('data');
      const categories = (result.data as { categories: SupportCategory[] }).categories;
      expect(categories.map((item) => item.id)).toEqual(['sc-first', 'sc-last1']);
    } finally {
      bridge.cleanup();
    }
  });
});
