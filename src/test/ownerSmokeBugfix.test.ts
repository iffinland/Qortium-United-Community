// ===== Owner-Smoke Bugfix Regression Tests =====
//
// Covers the three beta findings at the first production integration gate:
//   1. computer-file post images publish and link through a media reference;
//   2. forum category thread counts come from canonical forum topics;
//   3. project schema supports category/QDN URL and image references.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { store } from '../store';
import { qortiumApi } from '../store/api/qortiumApi';
import { forumApi } from '../store/api/forumApi';
import { projectApi } from '../store/api/projectApi';
import { projectSchema, type QucpProject } from '../services/qdn/schemas/projectSchema';
import { parseQdnUrl } from '../services/qortium/qdnNavigation';
import { publishQdnImage } from '../services/qdn/qdnImageService';
import { encodeQdnImageTag } from '../services/rich-text/richText';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const OWNER_NAME = 'iffi_vaba_mees';

const fakeImage = (): File => ({
  name: 'cover.png',
  type: 'image/png',
  size: 8,
  lastModified: 1700000000000,
  arrayBuffer: async () => new TextEncoder().encode('fake-png').buffer,
}) as unknown as File;

describe('owner-smoke bugfix regressions', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(qortiumApi.util.resetApiState());
    store.dispatch(forumApi.util.resetApiState());
    store.dispatch(projectApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    bridge.cleanup();
  });

  it('publishes a computer-selected image as inline rich content without a media reference', async () => {
    const ref = await publishQdnImage(fakeImage(), OWNER_NAME);

    expect(ref.service).toBe('IMAGE');
    expect(ref.identifier).toMatch(/^img-\d+-[a-z0-9]{6}$/);
    expect(bridge.published.filter((item) => item.service === 'IMAGE')).toHaveLength(1);

    const imagePublish = bridge.published.find((item) => item.service === 'IMAGE');
    expect(imagePublish?.payload).toMatchObject({ __binary: true });

    const result = await store.dispatch(
      qortiumApi.endpoints.publishPost.initiate({
        entityId: 'post0001',
        title: 'Cover post',
        content: `Post body ${encodeQdnImageTag(ref)}`,
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
      }),
    );

    expect(result).toHaveProperty('data');
    const postPublish = bridge.published.find(
      (item) => item.service === 'DOCUMENT' && item.identifier === 'qucp-post-post0001',
    );
    expect(postPublish).toBeDefined();
    expect(postPublish?.payload.resourceFamily).toBe('qucp-post');
    expect(postPublish?.payload.content).toContain('[imageqdn]');
    expect(postPublish?.payload.coverMediaEntityId).toBeUndefined();
    expect(bridge.published.some((item) => item.identifier.startsWith('qucp-mr-'))).toBe(false);
  });

  it('derives forum category thread counts from validated QDN topics', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-forum-topic-') {
          return [
            {
              name: OWNER_NAME,
              service: 'DOCUMENT',
              identifier: 'qucp-forum-topic-topic0001',
              created: 1700000000000,
            },
            {
              name: OWNER_NAME,
              service: 'DOCUMENT',
              identifier: 'qucp-forum-topic-topic0002',
              created: 1700000001000,
            },
          ];
        }
        return [];
      },
      fetch: (payload) => {
        const identifier = payload.identifier as string;
        const entityId = identifier === 'qucp-forum-topic-topic0001' ? 'topic0001' : 'topic0002';
        return {
          schemaVersion: 1,
          resourceFamily: 'qucp-forum-topic',
          entityId,
          title: entityId === 'topic0001' ? 'General thread' : 'Tech thread',
          content: 'Body',
          categoryId: entityId === 'topic0001' ? 'general' : 'tech',
          tags: [],
          ownerName: OWNER_NAME,
          ownerAddress: OWNER,
          createdAt: 1700000000000,
        };
      },
    });

    const result = await store.dispatch(forumApi.endpoints.getCategories.initiate());

    expect(result).toHaveProperty('data');
    const categories = result.data as Array<{ id: string; threadCount: number }>;
    expect(categories.find((category) => category.id === 'general')?.threadCount).toBe(1);
    expect(categories.find((category) => category.id === 'tech')?.threadCount).toBe(1);
    expect(categories.find((category) => category.id === 'projects')?.threadCount).toBe(0);
  });

  it('publishes an admin-created project with category, QDN URL, and inline rich description', async () => {
    const result = await store.dispatch(
      projectApi.endpoints.createProject.initiate({
        entityId: 'proj00001',
        title: 'Community infra',
        description: `Project description ${encodeQdnImageTag({
          service: 'IMAGE',
          name: OWNER_NAME,
          identifier: 'img-1787410000000-ab12cd',
          filename: 'cover.png',
        })}`,
        category: 'Infrastructure',
        qdnUrl: 'qdn://DOCUMENT/Example/default',
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
      }),
    );

    expect(result).toHaveProperty('data');

    const projectPublish = bridge.published.find(
      (item) => item.service === 'DOCUMENT' && item.identifier === 'qucp-project-proj00001',
    );
    expect(projectPublish).toBeDefined();
    expect(projectPublish?.payload.resourceFamily).toBe('qucp-project');
    expect(projectPublish?.payload.category).toBe('Infrastructure');
    expect(projectPublish?.payload.qdnUrl).toBe('qdn://DOCUMENT/Example/default');
    expect(projectPublish?.payload.imageEntityId).toBeUndefined();
    expect(projectPublish?.payload.description).toContain('[imageqdn]');
    expect(bridge.published.filter((item) => item.service === 'IMAGE')).toHaveLength(0);
  });

  it('keeps project category and qdn URL canonical through the project schema', () => {
    const project: QucpProject = {
      schemaVersion: 1,
      resourceFamily: 'qucp-project',
      entityId: 'proj00001',
      title: 'Infra project',
      description: 'Project description',
      status: 'planned',
      tags: [],
      category: 'Infrastructure',
      qdnUrl: 'qdn://DOCUMENT/Example/default',
      ownerName: OWNER_NAME,
      ownerAddress: OWNER,
      createdAt: 1700000000000,
    };

    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(projectSchema.safeParse({ ...project, qdnUrl: 'https://example.com' }).success).toBe(false);
  });

  it('parses qdn URLs into Qortium-native viewer coordinates', () => {
    expect(parseQdnUrl('qdn://DOCUMENT/Alice/notes/readme?view=plain#part')).toEqual({
      service: 'DOCUMENT',
      name: 'Alice',
      identifier: 'notes',
      path: 'readme',
    });
    expect(parseQdnUrl('https://example.com')).toBeNull();
  });
});
