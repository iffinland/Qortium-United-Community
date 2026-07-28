// ===== Role Registry Snapshot Schema =====
//
// Append-only immutable role registry snapshots.
// Each accepted registry version has its own deterministic QDN identifier.
//
// Replaces the single mutable qucp-v1-roles model from QUCP-REF-005.

import { z } from 'zod';

// ---- Schema Version and Family ----

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

// ---- Role Enum (unchanged from REF-005) ----

export const ROLE_VALUES = ['admin', 'moderator', 'support'] as const;
export type QucpRole = (typeof ROLE_VALUES)[number];

const roleField = z.enum(ROLE_VALUES);

// ---- Field Schemas ----

const walletField = z
  .string()
  .min(33)
  .max(36)
  .regex(/^Q[A-Za-z0-9]+$/, 'Invalid wallet address');

const displayNameField = z
  .string()
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, 'Invalid display name')
  .optional();

const snapshotIdField = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Snapshot ID must be lowercase alphanumeric with hyphens');

// ---- Member Entry ----

const snapshotMemberSchema = z
  .object({
    address: walletField,
    roles: z
      .array(roleField)
      .min(1, 'Member must have at least one role')
      .max(3, 'Member cannot have more than 3 roles'),
    displayName: displayNameField,
  })
  .strict();

// ---- Full Snapshot Schema ----

export const roleRegistrySnapshotSchema = z
  .object({
    schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
    resourceFamily: z.literal('qucp-role-snapshot'),

    /** Immutable snapshot identity. Participates in identifier key derivation. */
    snapshotId: snapshotIdField,

    /** Optional lineage: previous snapshot this one succeeds. Genesis omits. */
    previousSnapshotId: snapshotIdField.optional(),

    /** Must match the configured SysOp wallet. */
    sysopAddress: walletField,

    /** Complete role state for this point in history. */
    members: z
      .array(snapshotMemberSchema)
      .max(100, 'Snapshot cannot exceed 100 members'),

    /** Timestamp for diagnostics — NOT the ordering authority. */
    createdAt: z.number().int().positive(),
  })
  .strict()
  .refine(
    (data) => {
      const addresses = data.members.map((m) => m.address);
      return new Set(addresses).size === addresses.length;
    },
    { message: 'Duplicate wallet addresses in members' },
  )
  .refine(
    (data) => {
      for (const member of data.members) {
        const roleSet = new Set(member.roles);
        if (roleSet.size !== member.roles.length) return false;
      }
      return true;
    },
    { message: 'Duplicate roles in member entry' },
  )
  .refine(
    (data) => {
      // Snapshot cannot reference itself
      return data.previousSnapshotId !== data.snapshotId;
    },
    { message: 'Snapshot cannot reference itself as previous' },
  );

export type QucpRoleRegistrySnapshot = z.infer<typeof roleRegistrySnapshotSchema>;
