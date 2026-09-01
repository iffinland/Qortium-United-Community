// ===== Post Image Preview + Lightbox Regression =====
//
// Verifies the accessible larger-view contract for post detail images:
// bounded preview activation, modal dialog, Escape close, and suppression of
// the duplicated inline image from the body when a separate preview is shown.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QdnImagePreview } from '../components/common/QdnImagePreview';
import { RichTextContent } from '../components/editor/RichTextContent';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const imageRef = {
  service: 'IMAGE' as const,
  name: 'iffi_vaba_mees',
  identifier: 'img-1',
  filename: 'cover.png',
};

describe('QdnImagePreview lightbox', () => {
  let bridge: MockQdnBridge;

  afterEach(() => {
    cleanup();
    bridge.cleanup();
  });

  it('opens a larger contain-fitted dialog and closes with Escape', async () => {
    bridge = installMockQdnBridge();

    render(<QdnImagePreview imageRef={imageRef} alt="cover" />);

    const trigger = await screen.findByRole('button', {
      name: /view cover at full size/i,
    });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /cover/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const image = within(dialog).getByAltText('cover');
    expect(image.getAttribute('src')).toContain('/render/IMAGE/iffi_vaba_mees/img-1');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from the explicit close control', async () => {
    bridge = installMockQdnBridge();

    render(<QdnImagePreview imageRef={imageRef} alt="cover" />);

    fireEvent.click(
      await screen.findByRole('button', { name: /view cover at full size/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /close image preview/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('RichTextContent image suppression', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides the first inline image while preserving surrounding text', () => {
    render(
      <RichTextContent
        skipFirstImage
        value="[b]Before[/b] [imageqdn]iffi_vaba_mees|img-1|cover.png[/imageqdn] [i]After[/i]"
      />,
    );

    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('.rich-image-placeholder')).toBeNull();
  });

  it('renders the inline image when suppression is not requested', async () => {
    const bridge = installMockQdnBridge();

    render(
      <RichTextContent value="Body [imageqdn]iffi_vaba_mees|img-1|cover.png[/imageqdn]" />,
    );

    expect(await screen.findByAltText('cover.png')).toBeInTheDocument();
    bridge.cleanup();
  });
});
