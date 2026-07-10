// ===== Support Ticket Types =====

export type TicketType = 'bug' | 'feature' | 'question' | 'general';
export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';

export interface TicketResponse {
  id: string;
  ticketId: string;
  authorName: string;
  authorAddress: string;
  content: string;
  createdAt: string;
  isOfficial: boolean;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  authorName: string;
  authorAddress: string;
  createdAt: string;
  updatedAt: string;
  responses: TicketResponse[];
}
