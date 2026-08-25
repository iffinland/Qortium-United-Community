// ===== Wiki Runtime Production-Path Tests =====
//
// QUCP-WIKI-001: Canonical Wiki domain rewrite tests.
// Covers identity, create, update, slug, discovery, permissions, timestamps.

import { describe, it, expect } from 'vitest';
import {
  generateWikiEntityId,
  wikiSlug,
  buildWikiCreatePayload,
  buildWikiUpdatePayload,
} from '../services/qdn/runtime/wikiRuntime';
import type { QucpWikiArticle } from '../services/qdn/schemas/wikiArticleSchema';

// ---- Identity Tests ----

describe('wiki entity identity', () => {
  it('generates stable wk- prefixed IDs', () => {
    const id = generateWikiEntityId();
    expect(id).toMatch(/^wk-[a-z0-9-]+$/);
    expect(id.length).toBeGreaterThanOrEqual(6);
  });

  it('generates collision-resistant IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateWikiEntityId());
    }
    expect(ids.size).toBe(100);
  });

  it('create payload has revision 1', () => {
    const p = buildWikiCreatePayload({
      entityId: 'wk-abc123', categoryId: 'guides',
      title: 'Test', slug: 'test', content: 'Content',
      ownerName: 'Alice', ownerAddress: 'QAliceAliceAliceAliceAliceAliceAl',
      createdAt: 1700000000000,
    });
    expect(p.revision).toBe(1);
    expect(p.status).toBe('active');
  });

  it('update payload increments revision', () => {
    const existing = buildWikiCreatePayload({
      entityId: 'wk-abc123', categoryId: 'guides',
      title: 'Old Title', slug: 'old-title', content: 'Old content',
      ownerName: 'Alice', ownerAddress: 'QAliceAliceAliceAliceAliceAliceAl',
      createdAt: 1700000000000,
    });

    const updated = buildWikiUpdatePayload({
      existing,
      categoryId: 'guides',
      title: 'New Title', slug: 'new-title', content: 'New content',
      ownerName: existing.ownerName, ownerAddress: existing.ownerAddress,
      expectedRevision: 1,
    });

    expect(updated.revision).toBe(2);
    expect(updated.entityId).toBe(existing.entityId);
    expect(updated.ownerName).toBe(existing.ownerName);
    expect(updated.ownerAddress).toBe(existing.ownerAddress);
    expect(updated.createdAt).toBe(existing.createdAt);
  });

  it('update preserves immutable fields', () => {
    const existing = buildWikiCreatePayload({
      entityId: 'wk-xyz789', categoryId: 'faq',
      title: 'FAQ', slug: 'faq', content: 'Answers',
      ownerName: 'Bob', ownerAddress: 'QBobBobBobBobBobBobBobBobBobBobBo',
      createdAt: 1700000000000,
    });

    const updated = buildWikiUpdatePayload({
      existing,
      categoryId: 'faq',
      title: 'FAQ Updated', slug: 'faq-updated', content: 'More answers',
      ownerName: existing.ownerName, ownerAddress: existing.ownerAddress,
      expectedRevision: 1,
    });

    expect(updated.entityId).toBe('wk-xyz789');
    expect(updated.resourceFamily).toBe('qucp-wiki');
    expect(updated.schemaVersion).toBe(1);
    expect(updated.ownerName).toBe('Bob');
    expect(updated.ownerAddress).toBe('QBobBobBobBobBobBobBobBobBobBobBo');
    expect(updated.createdAt).toBe(1700000000000);
  });
});

// ---- Slug Tests ----

describe('wiki slug generation', () => {
  it('generates normal slug', () => {
    expect(wikiSlug('Hello World')).toBe('hello-world');
  });

  it('handles Estonian characters', () => {
    expect(wikiSlug('Tere päevast')).toBe('tere-paevast');
    expect(wikiSlug('Öösel')).toBe('oosel');
    expect(wikiSlug('Õun')).toBe('oun');
  });

  it('handles punctuation-only title', () => {
    const s = wikiSlug('!@#$%^&*()');
    expect(s).toMatch(/^article-/);
  });

  it('rejects reserved word new', () => {
    const s = wikiSlug('new');
    expect(s).toMatch(/^article-/);
  });

  it('rejects reserved word edit', () => {
    const s = wikiSlug('edit');
    expect(s).toMatch(/^article-/);
  });

  it('handles very long title', () => {
    const long = 'a'.repeat(200) + ' b'.repeat(200);
    const s = wikiSlug(long);
    expect(s.length).toBeLessThanOrEqual(100);
  });

  it('handles empty title', () => {
    const s = wikiSlug('');
    expect(s).toMatch(/^article-/);
  });

  it('handles duplicate hyphens', () => {
    expect(wikiSlug('hello   world')).toBe('hello-world');
  });

  it('handles leading/trailing separators', () => {
    expect(wikiSlug('  hello  ')).toBe('hello');
  });

  it('localizes case', () => {
    expect(wikiSlug('HELLO World')).toBe('hello-world');
  });
});

// ---- Create Tests ----

describe('wiki create payload', () => {
  it('builds valid create payload', () => {
    const p = buildWikiCreatePayload({
      entityId: 'wk-test01', categoryId: 'getting-started',
      title: 'Getting Started', slug: 'getting-started',
      content: 'Welcome to the wiki.',
      ownerName: 'Qortian',
      ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
      createdAt: 1700000000000,
    });

    expect(p.resourceFamily).toBe('qucp-wiki');
    expect(p.entityId).toBe('wk-test01');
    expect(p.title).toBe('Getting Started');
    expect(p.ownerName).toBe('Qortian');
    expect(p.ownerAddress).toBe('QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm');
    expect(p.revision).toBe(1);
    expect(p.status).toBe('active');
    expect(p.createdAt).toBe(1700000000000);
  });

  it('defaults summary from content', () => {
    const p = buildWikiCreatePayload({
      entityId: 'wk-s', categoryId: 'guides',
      title: 'T', slug: 't', content: 'A'.repeat(300),
      ownerName: 'N', ownerAddress: 'QAddrAddrAddrAddrAddrAddrAddrAddrAd',
      createdAt: 1700000000000,
    });
    expect(p.summary).toBe('A'.repeat(200));
  });

  it('accepts custom tags', () => {
    const p = buildWikiCreatePayload({
      entityId: 'wk-t', categoryId: 'guides',
      title: 'T', slug: 't', content: 'C',
      ownerName: 'N', ownerAddress: 'QAddrAddrAddrAddrAddrAddrAddrAddrAd',
      createdAt: 1700000000000,
      tags: ['guide', 'beginner'],
    });
    expect(p.tags).toEqual(['guide', 'beginner']);
  });

  it('defaults tags to empty array', () => {
    const p = buildWikiCreatePayload({
      entityId: 'wk-u', categoryId: 'guides',
      title: 'T', slug: 't', content: 'C',
      ownerName: 'N', ownerAddress: 'QAddrAddrAddrAddrAddrAddrAddrAddrAd',
      createdAt: 1700000000000,
    });
    expect(p.tags).toEqual([]);
  });
});

// ---- Update Tests ----

describe('wiki update payload', () => {
  const existing: QucpWikiArticle = {
    schemaVersion: 1, resourceFamily: 'qucp-wiki',
    entityId: 'wk-upd01', categoryId: 'guides',
    title: 'Original', slug: 'original', content: 'Original content',
    summary: 'Original summary', tags: ['old'],
    ownerName: 'Alice', ownerAddress: 'QAliceAliceAliceAliceAliceAliceAl',
    createdAt: 1700000000000, revision: 3, status: 'active',
  };

  it('updates mutable fields', () => {
    const p = buildWikiUpdatePayload({
      existing, expectedRevision: 3,
      categoryId: 'dev', title: 'Updated', slug: 'updated',
      content: 'Updated content', tags: ['new'],
      ownerName: existing.ownerName, ownerAddress: existing.ownerAddress,
    });
    expect(p.title).toBe('Updated');
    expect(p.slug).toBe('updated');
    expect(p.content).toBe('Updated content');
    expect(p.categoryId).toBe('dev');
    expect(p.tags).toEqual(['new']);
    expect(p.revision).toBe(4);
  });

  it('preserves immutable fields during update', () => {
    const p = buildWikiUpdatePayload({
      existing, expectedRevision: 3,
      categoryId: 'faq', title: 'FAQ', slug: 'faq',
      content: 'FAQ content',
      ownerName: existing.ownerName, ownerAddress: existing.ownerAddress,
    });
    expect(p.entityId).toBe('wk-upd01');
    expect(p.resourceFamily).toBe('qucp-wiki');
    expect(p.schemaVersion).toBe(1);
    expect(p.ownerName).toBe('Alice');
    expect(p.ownerAddress).toBe('QAliceAliceAliceAliceAliceAliceAl');
    expect(p.createdAt).toBe(1700000000000);
  });

  it('supports archiving', () => {
    const p = buildWikiUpdatePayload({
      existing, expectedRevision: 3,
      categoryId: 'guides', title: 'Archived', slug: 'archived',
      content: 'Archived content', newStatus: 'archived',
      ownerName: existing.ownerName, ownerAddress: existing.ownerAddress,
    });
    expect(p.status).toBe('archived');
  });

  it('rejects archive on already archived', () => {
    const archived = { ...existing, status: 'archived' as const };
    const p = buildWikiUpdatePayload({
      existing: archived, expectedRevision: 3,
      categoryId: 'guides', title: 'Still', slug: 'still',
      content: 'Still archived',
      ownerName: archived.ownerName, ownerAddress: archived.ownerAddress,
    });
    expect(p.status).toBe('archived');
  });
});

// ---- Legacy Compatibility (removed) ----

// ---- Identity Strength ----

describe('wiki identity strength', () => {
  it('full UUID format without hyphens', () => {
    const id = generateWikiEntityId();
    expect(id).toMatch(/^wk-[a-f0-9]{32}$/);
  });

  it('generates unique IDs across many calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateWikiEntityId();
      expect(id.length).toBe(35); // wk- + 32 hex chars
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });
});
