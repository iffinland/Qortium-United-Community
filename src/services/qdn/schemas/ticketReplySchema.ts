// ===== Ticket Reply Schema =====
//
// qucp-ticket-reply: responses to support tickets.
//
// Immutable: schemaVersion, resourceFamily, entityId, parentEntityId, ownerName, ownerAddress, createdAt
// Mutable: content
// Prohibited: isOfficial, ticketStatus, assignedTo, resolution (staff ops belong to separate future operations)

import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  ownerNameField,
  ownerAddressField,
  timestampField,
  editedAtField,
  contentField,
} from './commonSchemas';

export const ticketReplySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-ticket-reply'),

  entityId: entityIdField,
  /** The support ticket this reply belongs to. */
  parentEntityId: entityIdField,

  ownerName: ownerNameField,
  ownerAddress: ownerAddressField,

  content: contentField,

  createdAt: timestampField,
  editedAt: editedAtField,
}).strict();

export type QucpTicketReply = z.infer<typeof ticketReplySchema>;

export const TICKET_REPLY_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'parentEntityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
