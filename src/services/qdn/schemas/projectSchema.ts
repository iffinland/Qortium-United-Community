// ===== Project Schema =====
//
// qucp-project: canonical standalone community project.
//
// Lifecycle (approved v1):
//   planned → active
//   planned → archived
//   active → completed
//   active → archived
//   completed → archived
//   Same-state updates: planned→planned, active→active, completed→completed (mutable content only)
//   archived is TERMINAL — no same-state updates allowed
//
// Immutable after publication:
//   entityId, ownerName, ownerAddress, donationAddress, fundingGoal,
//   schemaVersion, resourceFamily, createdAt
//
// Mutable (canonical owner only):
//   title, description, status (approved transitions only), tags, imageEntityId,
//   website, repository, editedAt
//
// Funding metadata contract:
//   donationAddress may exist without fundingGoal
//   fundingGoal requires donationAddress
//   both may be absent
//   fundingGoal without donationAddress is invalid
//   Both fields immutable after initial publication

import { z } from 'zod';
import {
  authoritativeEntityBase,
  SCHEMA_VERSION,
  walletAddressField,
} from './commonSchemas';

// ---- Lifecycle Status ----

export const PROJECT_STATUS_VALUES = ['planned', 'active', 'completed', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

/** Approved v1 lifecycle transitions. Same-state allowed for non-archived statuses. */
export const VALID_LIFECYCLE_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  planned:   ['planned', 'active', 'archived'],
  active:    ['active', 'completed', 'archived'],
  completed: ['completed', 'archived'],
  archived:  [], // terminal — no transitions, not even same-state
} as const;

export function isApprovedLifecycleTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  const allowed = VALID_LIFECYCLE_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

/** @deprecated Use isApprovedLifecycleTransition instead. */
export function isForwardLifecycleTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  return isApprovedLifecycleTransition(from, to);
}

// ---- Immutable Fields ----

export const PROJECT_IMMUTABLE_FIELDS = [
  'entityId',
  'ownerName',
  'ownerAddress',
  'donationAddress',
  'fundingGoal',
  'schemaVersion',
  'resourceFamily',
  'createdAt',
] as const;

// ---- Schema Fields ----

const titleField = z.string().min(1).max(200).trim();
const descriptionField = z.string().min(1).max(5000).trim();
const statusField = z.enum(PROJECT_STATUS_VALUES);
const tagsField = z.array(z.string().min(1).max(32).trim()).max(10).optional();
const imageEntityIdField = z.string().max(64).optional();
const websiteField = z.string().url().max(500).optional().or(z.literal(''));
const repositoryField = z.string().url().max(500).optional().or(z.literal(''));
const categoryField = z.string().trim().min(1).max(50).optional();
const qdnUrlField = z
  .string()
  .trim()
  .min('qdn://x/x'.length)
  .max(500)
  .regex(/^qdn:\/\//i, 'QDN URL must start with qdn://')
  .optional();
const donationAddressField = walletAddressField.optional();
const fundingGoalField = z.number().int().positive().optional();
const editedAtField = z.number().int().positive().optional();

// ---- Project Schema ----

export const projectSchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-project'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  title: titleField,
  description: descriptionField,
  status: statusField,
  tags: tagsField,
  imageEntityId: imageEntityIdField,
  website: websiteField,
  repository: repositoryField,
  category: categoryField,
  qdnUrl: qdnUrlField,
  donationAddress: donationAddressField,
  fundingGoal: fundingGoalField,
  editedAt: editedAtField,
}).strict()
  .refine(
    (data) => {
      // fundingGoal requires donationAddress; donationAddress may exist alone
      const hasGoal = typeof data.fundingGoal === 'number';
      const hasDonation = !!data.donationAddress;
      if (hasGoal && !hasDonation) {
        return false;
      }
      return true;
    },
    { message: 'fundingGoal requires donationAddress; donationAddress may exist alone' },
  );

export type QucpProject = z.infer<typeof projectSchema>;
