// ===== Media Linkage Validator =====

import type { QucpMediaReference } from '../schemas/mediaReferenceSchema';
import type { MediaParentAuthStatus } from './mediaTypes';
import type { QdnMediaMetadata, MediaLinkageResult } from './mediaTypes';

export function validateMediaLinkage(
  reference: QucpMediaReference,
  parentAuth: MediaParentAuthStatus,
  metadata: QdnMediaMetadata | null,
  metadataAvailable: boolean,
): MediaLinkageResult {
  if (parentAuth !== 'authorized') {
    return { status: 'parent-unavailable', reason: `Parent authorization: ${parentAuth}` };
  }
  if (!metadataAvailable) {
    return { status: 'resource-unavailable', reason: 'QDN media metadata temporarily unavailable' };
  }
  if (!metadata) {
    return { status: 'resource-not-found', reason: `Media resource ${reference.qdnIdentifier} not found` };
  }
  if (metadata.identifier !== reference.qdnIdentifier) {
    return { status: 'identifier-mismatch', reason: 'QDN identifier mismatch' };
  }
  if (metadata.service !== reference.qdnService) {
    return { status: 'service-mismatch', reason: `Service mismatch: ${metadata.service} vs ${reference.qdnService}` };
  }
  if (metadata.publisherAddress && metadata.publisherAddress !== reference.ownerAddress) {
    return { status: 'resource-publisher-mismatch', reason: 'Media publisher does not match reference owner' };
  }
  if (reference.mimeType && metadata.mimeType && reference.mimeType !== metadata.mimeType) {
    return { status: 'mime-mismatch', reason: `MIME mismatch: ${reference.mimeType} vs ${metadata.mimeType}` };
  }
  if (reference.size !== undefined && metadata.size !== undefined && reference.size !== metadata.size) {
    return { status: 'size-mismatch', reason: `Size mismatch: ${reference.size} vs ${metadata.size}` };
  }
  return { status: 'linked', metadata };
}
