// ===== Forum Types =====

export interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  threadCount: number;
  lastActivityAt: string;
}

export interface ForumThread {
  id: string;
  categoryId: string;
  title: string;
  content: string;
  authorName: string;
  authorAddress: string;
  createdAt: string | null;
  updatedAt?: string | null;
  tags?: string[];
}

export interface ThreadReply {
  id: string;
  threadId: string;
  authorName: string;
  authorAddress: string;
  content: string;
  createdAt: string | null;
  parentReplyId: string | null;
}

export interface ThreadWithReplies extends ForumThread {
  replies: ThreadReply[];
}
