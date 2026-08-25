// ===== Support Types =====

export type TicketType = 'bug' | 'feature' | 'question' | 'general';

export type TicketStatus = 'Open' | 'Closed';

export interface TicketResponse {
  id: string;
  ticketId: string;
  authorName: string;
  authorAddress: string;
  content: string;
  createdAt: string;
}

export interface SupportCategory {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder?: number;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  type: TicketType;
  categoryId: string;
  categoryName?: string;
  authorName: string;
  authorAddress: string;
  createdAt: string;
  updatedAt?: string;
  /** True when createdAt was derived from QDN metadata (not fabricated). Undefined when fabricated. */
  timestampFromQdn?: boolean;
  status: TicketStatus;
  closedAt?: string;
  closedBy?: string;
  /**
   * True when an Admin-authorized close may exist but role history is degraded
   * (incomplete/unavailable/ambiguous), so the authoritative close state cannot
   * currently be proven. Replies must be quarantined and the ticket must not be
   * presented as safely Open.
   */
  closeBoundaryDegraded?: boolean;
  responses: TicketResponse[];
}
