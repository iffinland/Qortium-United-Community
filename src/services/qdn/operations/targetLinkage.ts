// ===== Target Linkage =====
//
// Classify reaction/tombstone linkage to target entities
// without network calls. Uses already-loaded target data.

export type TargetLinkStatus =
  | 'linked'
  | 'target-unavailable'
  | 'target-rejected'
  | 'target-missing'
  | 'target-family-mismatch';

export interface TargetLinkResult {
  status: TargetLinkStatus;
  targetFamily: string;
  targetEntityId: string;
}

interface TargetInfo {
  entityId: string;
  resourceFamily: string;
  status: 'accepted' | 'rejected' | 'unavailable';
}

export function classifyTargetLink(
  targetFamily: string,
  targetEntityId: string,
  loadedTargets: TargetInfo[],
): TargetLinkResult {
  const target = loadedTargets.find((t) => t.entityId === targetEntityId);

  if (!target) {
    return { status: 'target-missing', targetFamily, targetEntityId };
  }

  if (target.resourceFamily !== targetFamily) {
    return { status: 'target-family-mismatch', targetFamily, targetEntityId };
  }

  if (target.status === 'unavailable') {
    return { status: 'target-unavailable', targetFamily, targetEntityId };
  }

  if (target.status === 'rejected') {
    return { status: 'target-rejected', targetFamily, targetEntityId };
  }

  return { status: 'linked', targetFamily, targetEntityId };
}
