// ===== Support Category Schema =====
//
// qucp-support-category: admin-managed support ticket categories.
//
// Immutable: schemaVersion, resourceFamily, entityId, ownerName, ownerAddress, createdAt
// Mutable (Admin/SysOp): name, description, isActive, sortOrder

import { z } from 'zod';
import {
  authoritativeEntityBase,
  SCHEMA_VERSION,
} from './commonSchemas';

const categoryNameField = z.string().min(1).max(64).trim();

const categoryDescriptionField = z.string().max(500).optional();

export const supportCategorySchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-support-category'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  name: categoryNameField,
  description: categoryDescriptionField,
  isActive: z.boolean(),
  sortOrder: z.number().int().finite().optional(),
}).strict();

export type QucpSupportCategory = z.infer<typeof supportCategorySchema>;
