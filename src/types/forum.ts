// ===== Forum Types =====

export interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or icon name
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
  createdAt: string;
  updatedAt?: string;
  replyCount: number;
  viewCount: number;
  isPinned: boolean;
  isLocked: boolean;
  tags?: string[];
}

export interface ThreadReply {
  id: string;
  threadId: string;
  authorName: string;
  authorAddress: string;
  content: string;
  createdAt: string;
  parentReplyId: string | null;
  likes: number;
}

export interface ThreadWithReplies extends ForumThread {
  replies: ThreadReply[];
}
