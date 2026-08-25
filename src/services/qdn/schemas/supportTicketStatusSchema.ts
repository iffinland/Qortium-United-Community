// ===== Support Ticket Status Operation Schema =====
//
// qucp-support-ticket-status: canonical ticket lifecycle operations.
//
// Current owner-approved lifecycle: Open -> Closed. Reopen is intentionally
// not part of the schema or product behavior.
//
// The operation is published by the actor (ticket author, Admin, or SysOp)
// rather than mutating the ticket entity in place. Read paths reduce accepted
// operations against the ticket author and role history to derive effective
// ticket status.

import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  ownerNameField,
  ownerAddressField,
  timestampField,
} from './commonSchemas';

export const SUPPORT_TICKET_STATUS_ACTION = 'close' as const;

export const supportTicketStatusSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-support-ticket-status'),

  operationId: entityIdField,

  targetFamily: z.literal('qucp-support-ticket'),
  targetEntityId: entityIdField,

  actorName: ownerNameField,
  actorAddress: ownerAddressField,

  action: z.literal(SUPPORT_TICKET_STATUS_ACTION),
  reason: z.string().max(500).optional(),

  createdAt: timestampField,
}).strict();

export type QucpSupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;
