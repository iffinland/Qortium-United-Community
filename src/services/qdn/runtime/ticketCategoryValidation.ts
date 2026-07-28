// ===== Ticket Category Validation =====
//
// Validates that a category is eligible for ticket creation.
// Enforces: category exists, is accepted, is active, discovery is available.

import type { SupportCategoryQueryResult } from './supportRuntime';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Result Type ----

export type TicketCategoryValidation =
  | { valid: true; categoryId: string; categoryName: string }
  | { valid: false; reason: TicketCategoryRejection; detail?: string };

export type TicketCategoryRejection =
  | 'category-discovery-unavailable'
  | 'category-discovery-incomplete-category-absent'
  | 'category-not-found'
  | 'category-not-accepted'
  | 'category-archived'
  | 'category-id-empty';

// ---- Validation Function ----

/**
 * Validate that a selected category is eligible for ticket creation.
 *
 * Rules:
 *   - Discovery must not be unavailable
 *   - categoryId must be non-empty
 *   - Category must exist in accepted validated categories
 *   - Category must be active
 *
 * Conservative incomplete rule:
 *   If discovery is incomplete and the selected category is NOT in the
 *   partial result, block publication — do not conclude it doesn't exist.
 *   If discovery is incomplete but the category IS present, accepted,
 *   and active, allow with a diagnostic note.
 */
export function validateTicketCategoryForCreation(
  categoryId: string,
  categoryResult: SupportCategoryQueryResult,
): TicketCategoryValidation {
  // Discovery unavailable
  if (categoryResult.status === 'unavailable') {
    return {
      valid: false,
      reason: 'category-discovery-unavailable',
      detail: 'Support categories are currently unavailable',
    };
  }

  // Empty categoryId
  if (!categoryId) {
    return { valid: false, reason: 'category-id-empty' };
  }

  // Find the category in accepted items
  const found = categoryResult.items.find(
    (item) => item.entityId === categoryId,
  );

  // Category not found in results
  if (!found) {
    // Conservative incomplete rule: if discovery is incomplete, don't
    // conclude the category doesn't exist — block and ask to retry
    if (categoryResult.status === 'incomplete') {
      return {
        valid: false,
        reason: 'category-discovery-incomplete-category-absent',
        detail: `Category "${categoryId}" not found in incomplete results. Retry when discovery completes.`,
      };
    }

    // Complete or empty discovery — category genuinely not found
    return {
      valid: false,
      reason: 'category-not-found',
      detail: `Category "${categoryId}" not found`,
    };
  }

  // Category must be active
  const data = found.envelope.data as { isActive?: boolean; name?: string };
  if (!data.isActive) {
    return {
      valid: false,
      reason: 'category-archived',
      detail: `Category "${data.name ?? categoryId}" is archived`,
    };
  }

  return {
    valid: true,
    categoryId: found.entityId,
    categoryName: (data.name as string) ?? categoryId,
  };
}

/**
 * Build a diagnostic for a category validation rejection.
 */
export function categoryRejectionDiagnostic(
  rejection: TicketCategoryRejection,
  categoryId: string,
  detail?: string,
): QdnDiagnostic {
  return {
    level: 'warning',
    code: `support-ticket-category-${rejection}`,
    message: detail ?? `Category validation failed: ${rejection}`,
    identifier: categoryId,
  };
}
