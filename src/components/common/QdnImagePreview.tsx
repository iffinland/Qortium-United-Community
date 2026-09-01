// ===== QDN Image Preview + Lightbox =====
//
// Renders a bounded, contain-fitted preview for a canonical QDN image
// reference and opens an accessible larger view on activation. The image is
// never cropped destructively in the preview; existing cover thumbnails keep
// their own object-cover behavior elsewhere.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useQdnImageUrl } from '../../hooks/useQdnImageUrl';
import type { QdnImageRef } from '../../types';

interface QdnImagePreviewProps {
  imageRef: QdnImageRef;
  alt?: string;
  /** Classes applied to the bounded preview <img>. */
  previewClassName?: string;
  /** Classes applied to the wrapping preview button. */
  buttonClassName?: string;
}

export function QdnImagePreview({
  imageRef,
  alt = '',
  previewClassName,
  buttonClassName,
}: QdnImagePreviewProps) {
  const [open, setOpen] = useState(false);
  const { url, handleError } = useQdnImageUrl(imageRef);

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!url) {
    return (
      <div
        className={`bg-[var(--color-surface-muted)] ${previewClassName ?? ''}`}
        role="presentation"
        aria-label={alt || undefined}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`block w-full cursor-zoom-in ${buttonClassName ?? ''}`}
        aria-label={`View ${alt || 'image'} at full size`}
        title="View larger"
      >
        <img
          src={url}
          alt={alt}
          className={previewClassName}
          onError={handleError}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={alt || 'Image preview'}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            autoFocus
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="flex max-h-[90vh] max-w-[90vw] items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={url}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] w-auto rounded-lg object-contain"
              onError={handleError}
            />
          </div>
        </div>
      )}
    </>
  );
}
