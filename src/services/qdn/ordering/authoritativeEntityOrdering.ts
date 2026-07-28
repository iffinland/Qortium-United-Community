// ===== Authoritative Entity Ordering =====
//
// Deterministic ordering for accepted entity versions from the same owner.
// Uses authenticated QDN metadata — not payload timestamps.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';

/**
 * Compare two resource envelopes for deterministic ordering.
 *
 * Ordering priority:
 *   1. QDN metadata.updated timestamp (descending — newer first)
 *   2. QDN metadata.created timestamp (descending)
 *   3. Publisher name (ascending, lexicographic)
 *   4. Identifier (ascending, lexicographic)
 *
 * Returns negative if a < b (a is "newer" / preferred), positive if a > b.
 */
export function compareByQdnMetadata(
  a: QdnResourceEnvelope<unknown>,
  b: QdnResourceEnvelope<unknown>,
): number {
  // 1. QDN updated timestamp
  const aUpdated = a.metadata.updated ?? 0;
  const bUpdated = b.metadata.updated ?? 0;
  if (aUpdated !== bUpdated) return bUpdated - aUpdated; // newer first

  // 2. QDN created timestamp
  const aCreated = a.metadata.created ?? 0;
  const bCreated = b.metadata.created ?? 0;
  if (aCreated !== bCreated) return bCreated - aCreated;

  // 3. Publisher name
  const nameCmp = a.metadata.name.localeCompare(b.metadata.name);
  if (nameCmp !== 0) return nameCmp;

  // 4. Identifier
  return a.metadata.identifier.localeCompare(b.metadata.identifier);
}

/**
 * Select the most recent accepted version from a list of envelopes
 * from the same owner, using deterministic metadata-based ordering.
 */
export function selectLatestVersion<T>(
  envelopes: QdnResourceEnvelope<T>[],
): QdnResourceEnvelope<T> | null {
  if (envelopes.length === 0) return null;
  return envelopes.reduce((best, current) =>
    compareByQdnMetadata(current, best) < 0 ? current : best,
  );
}

// ---- Creation and Update Classification ----

export interface EntityClassification {
  /** Whether this is the first accepted creation for the entity */
  isCreation: boolean;
  /** Whether this is a subsequent update from the same owner */
  isUpdate: boolean;
  /** The creation envelope (the earliest accepted version) */
  creation: QdnResourceEnvelope<unknown>;
}

/**
 * Classify an accepted envelope against a list of previously accepted
 * envelopes for the same logical entity.
 *
 * If the list is empty, this envelope is a creation candidate.
 * If the list contains envelopes from the same publisher, this is
 * an update candidate.
 */
export function classifyEntity<T>(
  envelope: QdnResourceEnvelope<T>,
  existingAccepted: QdnResourceEnvelope<unknown>[],
): EntityClassification {
  // Find the creation (chronologically earliest)
  const sorted = [...existingAccepted].sort(
    (a, b) => (a.metadata.created ?? 0) - (b.metadata.created ?? 0),
  );
  const creation: QdnResourceEnvelope<unknown> =
    sorted.length > 0 ? sorted[0] : envelope;

  const isCreation = existingAccepted.length === 0;

  // Check if any existing envelope has the same publisher
  const samePublisher = existingAccepted.some(
    (e) =>
      e.metadata.name === envelope.metadata.name &&
      e.resolvedPublisherAddress === envelope.resolvedPublisherAddress,
  );

  const isUpdate = !isCreation && samePublisher;

  return { isCreation, isUpdate, creation };
}

// ---- Immutable Field Validation ----

export interface ImmutableFieldResult {
  valid: boolean;
  changedFields: string[];
  diagnostics: string[];
}

/**
 * Check that immutable fields have not changed between an original
 * creation and a proposed update.
 */
export function validateImmutableFields(
  creationData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  immutableFields: readonly string[],
): ImmutableFieldResult {
  const changedFields: string[] = [];
  const diagnostics: string[] = [];

  for (const field of immutableFields) {
    const original = creationData[field];
    const updated = updateData[field];

    if (JSON.stringify(original) !== JSON.stringify(updated)) {
      changedFields.push(field);
      diagnostics.push(
        `Immutable field "${field}" changed from ${JSON.stringify(original)} to ${JSON.stringify(updated)}`,
      );
    }
  }

  return {
    valid: changedFields.length === 0,
    changedFields,
    diagnostics,
  };
}
