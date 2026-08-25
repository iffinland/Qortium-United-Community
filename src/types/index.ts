// ===== Qortium United Community – Core Types =====

/**
 * Production authorization roles.
 *
 * SysOp is the trust anchor and is never assignable through role data.
 * Admin is the only assignable privileged role.
 * User is the safe default / non-privileged state for everyone else.
 */
export type UserRole = 'SysOp' | 'Admin' | 'User';

export interface UserAccount {
  address: string;
  name: string | null;
  names: string[];
  avatarUrl?: string | null;
  publicKey?: string;
}

/** Canonical QDN image reference used by rich content and derived thumbnails. */
export interface QdnImageRef {
  service: 'IMAGE';
  name: string;
  identifier: string;
  filename?: string;
  mimeType?: string;
  size?: number;
}

export interface RoleRegistry {
  primarySysOpAddress: string;
  sysOps: string[];
  admins: string[];
  moderators: string[];
  creators: string[];
  updatedAt: number | null;
}

export interface FundTransaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  description: string;
  timestamp: string;
  txHash: string;
}

export interface FundState {
  balance: number;
  transactions: FundTransaction[];
  isLoading: boolean;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorAddress: string;
  createdAt: string | null;
  /** Authoritative QDN creation epoch, when available. Used for canonical updates. */
  createdAtMs?: number | null;
  updatedAt?: string | null;
  isPinned: boolean;
  tags?: string[];
  /** Resolved QDN image reference derived from content or a legacy media reference. */
  coverImageRef?: QdnImageRef;
  /** Legacy entity ID of a qucp-media-reference resource for the cover image. */
  coverMediaEntityId?: string;
  status?: 'active' | 'deleted';
}

export interface Comment {
  id: string;
  postId: string;
  authorName: string;
  authorAddress: string;
  content: string;
  createdAt: string | null;
  parentCommentId?: string | null;
}

export interface PostWithComments extends Post {
  comments: Comment[];
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  closesAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PollOption {
  id: string;
  label: string;
  voteCount: number;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'planned';
  progress: number;
  leadName: string;
  createdAt: string;
}
