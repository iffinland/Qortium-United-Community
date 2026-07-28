// ===== Support Ticket Schema =====
//
// qucp-support-ticket: community support tickets.
//
// Immutable: schemaVersion, resourceFamily, entityId, ownerName, ownerAddress, createdAt
// Mutable (owner): title, description, type, userPriority
// Prohibited (must use future staff operations): staffPriority, status, assignedTo, resolution, closedAt

import { z } from 'zod';
import {
  authoritativeEntityBase,
  titleField,
  contentField,
  entityIdField,
  SCHEMA_VERSION,
} from './commonSchemas';

const ticketTypeField = z.enum(['bug', 'feature', 'question', 'general']);

const userPriorityField = z.enum(['low', 'medium', 'high']);

export const supportTicketSchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-support-ticket'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  title: titleField,
  description: contentField,
  type: ticketTypeField,
  userPriority: userPriorityField,
  categoryId: entityIdField,
}).strict();

export type QucpSupportTicket = z.infer<typeof supportTicketSchema>;

export const TICKET_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
