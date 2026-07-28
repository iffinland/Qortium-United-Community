// ===== Media Types =====
//
// Typed interfaces for QDN media reference authorization and linkage.

// ---- Canonical Parent Info ----

export interface CanonicalParentInfo {
  entityId: string;
  resourceFamily: string;
  ownerName: string;
  ownerAddress: string;
  status: 'accepted' | 'rejected' | 'unavailable';
}

// ---- Parent Authorization ----

export type MediaParentAuthStatus =
  | 'authorized'
  | 'parent-missing'
  | 'parent-unavailable'
  | 'parent-rejected'
  | 'parent-family-mismatch'
  | 'parent-entity-mismatch'
  | 'owner-mismatch';

export interface MediaParentAuthResult {
  status: MediaParentAuthStatus;
  reason?: string;
}

// ---- QDN Media Metadata (normalized from Core) ----

export type MediaResourceStatus =
  | 'available'
  | 'unconfirmed'
  | 'unavailable'
  | 'deleted'
  | 'blocked'
  | 'unknown';

export interface QdnMediaMetadata {
  service: string;
  identifier: string;
  publisherName: string;
  publisherAddress?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  status: MediaResourceStatus;
}

// ---- Linkage ----

export type MediaLinkageStatus =
  | 'linked'
  | 'parent-unavailable'
  | 'parent-unauthorized'
  | 'resource-not-found'
  | 'resource-unavailable'
  | 'resource-publisher-mismatch'
  | 'service-mismatch'
  | 'identifier-mismatch'
  | 'mime-mismatch'
  | 'size-mismatch'
  | 'metadata-incomplete';

export interface MediaLinkageResult {
  status: MediaLinkageStatus;
  reason?: string;
  metadata?: QdnMediaMetadata;
}
