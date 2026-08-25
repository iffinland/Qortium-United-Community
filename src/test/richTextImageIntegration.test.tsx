// ===== RichText + Image Integration Tests =====
//
// Focused validation for the shared rich-text editor and inline QDN image
// model. The parent-content publication boundary is tested explicitly:
// publishing an image must never publish the enclosing post/project content.

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  decodeQdnImagePayload,
  encodeQdnImageTag,
  findFirstQdnImageRef,
  getSafeLinkHref,
  hasRichTextMarkup,
  toPlainTextPreview,
} from '../services/rich-text/richText';
import { publishQdnImage } from '../services/qdn/qdnImageService';
import { fetchContentImageRef } from '../services/qdn/runtime/qdnRuntimeService';
import { RichTextContent } from '../components/editor/RichTextContent';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER_NAME = 'iffi_vaba_mees';

const fakeImage = (): File =>
  ({
    name: 'cover.png',
    type: 'image/png',
    size: 8,
    lastModified: 1700000000000,
    arrayBuffer: async () => new TextEncoder().encode('fake-png').buffer,
  }) as unknown as File;

describe('rich text serialization', () => {
  it('round-trips a canonical QDN image tag', () => {
    const ref = {
      service: 'IMAGE' as const,
      name: 'Alice',
      identifier: 'img-1',
      filename: 'photo | one.png',
      mimeType: 'image/png',
      size: 1234,
    };
    const tag = encodeQdnImageTag(ref);
    expect(tag).toBe('[imageqdn]Alice|img-1|photo%20%7C%20one.png|image%2Fpng|1234[/imageqdn]');
    expect(decodeQdnImagePayload(tag.slice('[imageqdn]'.length, -'[/imageqdn]'.length))).toMatchObject({
      service: 'IMAGE',
      name: 'Alice',
      identifier: 'img-1',
      size: 1234,
    });
  });

  it('derives the first content image for thumbnails', () => {
    const content = 'Intro [b]bold[/b] [imageqdn]Alice|img-1|cover.png[/imageqdn] body';
    const ref = findFirstQdnImageRef(content);
    expect(ref).not.toBeNull();
    expect(ref?.identifier).toBe('img-1');
    expect(findFirstQdnImageRef('plain markdown ![alt](url)')).toBeNull();
  });

  it('detects rich markup and renders safe plain previews', () => {
    expect(hasRichTextMarkup('[b]bold[/b]')).toBe(true);
    expect(hasRichTextMarkup('**legacy markdown**')).toBe(false);
    expect(toPlainTextPreview('**legacy** [b]rich[/b] ![alt](url)')).toBe('legacy rich alt');
  });

  it('blocks unsafe link schemes', () => {
    expect(getSafeLinkHref('javascript:alert(1)')).toBe('');
    expect(getSafeLinkHref(' data:text/html,x')).toBe('');
    expect(getSafeLinkHref('https://example.com')).toBe('https://example.com');
    expect(getSafeLinkHref('qdn://DOCUMENT/Name/id')).toBe('qdn://DOCUMENT/Name/id');
  });
});

describe('inline image publication boundary', () => {
  let bridge: MockQdnBridge;

  afterEach(() => {
    bridge.cleanup();
  });

  it('publishes only the IMAGE resource, never the parent content', async () => {
    bridge = installMockQdnBridge();

    const ref = await publishQdnImage(fakeImage(), OWNER_NAME);

    expect(ref.service).toBe('IMAGE');
    expect(ref.name).toBe(OWNER_NAME);
    expect(ref.identifier).toMatch(/^img-\d+-[a-z0-9]{6}$/);
    expect(bridge.published).toHaveLength(1);
    expect(bridge.published[0].service).toBe('IMAGE');
    expect(bridge.published[0].service).not.toBe('DOCUMENT');
  });

  it('resolves an inline image ref without issuing a search/fetch', async () => {
    bridge = installMockQdnBridge();
    const content = `Body ${encodeQdnImageTag({
      service: 'IMAGE',
      name: OWNER_NAME,
      identifier: 'img-1',
      filename: 'cover.png',
    })}`;

    const ref = await fetchContentImageRef(content, undefined);

    expect(ref?.identifier).toBe('img-1');
    expect(bridge.calls.some((call) => call.action === 'SEARCH_QDN_RESOURCES')).toBe(false);
    expect(bridge.published).toHaveLength(0);
  });
});

describe('rich content rendering', () => {
  it('renders formatting and neutralizes unsafe links', () => {
    render(
      <RichTextContent value="[b]Hello[/b] [url=javascript:alert(1)]click[/url] [url=https://example.com]web[/url]" />,
    );

    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('click').closest('a')).toBeNull();
    const webLink = screen.getByText('web').closest('a');
    expect(webLink?.getAttribute('href')).toBe('https://example.com');
  });
});
