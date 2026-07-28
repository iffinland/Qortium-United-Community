// ===== Support Types =====

export type TicketType = 'bug' | 'feature' | 'question' | 'general';

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
  responses: TicketResponse[];
}
