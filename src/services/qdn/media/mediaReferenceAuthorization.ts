// ===== Media Reference Parent Authorization =====

import type { QucpMediaReference } from '../schemas/mediaReferenceSchema';
import type { CanonicalParentInfo, MediaParentAuthResult } from './mediaTypes';

export function authorizeMediaReferenceForParent(
  reference: QucpMediaReference,
  parent: CanonicalParentInfo | null,
): MediaParentAuthResult {
  if (!parent) return { status: 'parent-missing', reason: 'Parent entity not found' };
  if (parent.status === 'unavailable') return { status: 'parent-unavailable', reason: 'Parent temporarily unavailable' };
  if (parent.status === 'rejected') return { status: 'parent-rejected', reason: 'Parent entity was rejected' };
  if (parent.resourceFamily !== reference.parentFamily) return { status: 'parent-family-mismatch', reason: `Parent family "${parent.resourceFamily}" != "${reference.parentFamily}"` };
  if (parent.entityId !== reference.parentEntityId) return { status: 'parent-entity-mismatch', reason: `Parent entity "${parent.entityId}" != "${reference.parentEntityId}"` };
  if (parent.ownerAddress !== reference.ownerAddress) return { status: 'owner-mismatch', reason: 'Parent owner does not match reference owner' };
  if (parent.ownerName !== reference.ownerName) return { status: 'owner-mismatch', reason: 'Parent owner name mismatch' };
  return { status: 'authorized' };
}
