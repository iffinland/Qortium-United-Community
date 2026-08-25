// ===== QDN Image =====
//
// Renders a canonical QDN image reference through the Qortium bridge.
// Used by rich content and by list/card thumbnails that derive their image
// from the first suitable image in a content body.

import type { QdnImageRef } from '../../types';
import { useQdnImageUrl } from '../../hooks/useQdnImageUrl';

interface QdnImageProps {
  imageRef: QdnImageRef;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function QdnImage({
  imageRef,
  alt = '',
  className,
  loading = 'lazy',
}: QdnImageProps) {
  const { url, handleError } = useQdnImageUrl(imageRef);

  if (!url) {
    return (
      <div
        className={`bg-[var(--color-surface-muted)] ${className ?? ''}`}
        role="presentation"
        aria-label={alt || undefined}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
    />
  );
}
