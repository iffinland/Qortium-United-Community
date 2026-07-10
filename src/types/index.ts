// ===== Qortium United Community – Core Types =====

export type UserRole =
  | 'SysOp'
  | 'SuperAdmin'
  | 'Admin'
  | 'Moderator'
  | 'Creator'
  | 'Member';

export interface UserAccount {
  address: string;
  name: string | null;
  names: string[];
  avatarUrl?: string | null;
  publicKey?: string;
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
  createdAt: string;
  updatedAt?: string | null;
  commentsCount: number;
  likesCount: number;
  isPinned: boolean;
  tags?: string[];
  imageUrl?: string;
  status?: 'active' | 'deleted';
}

export interface Comment {
  id: string;
  postId: string;
  authorName: string;
  authorAddress: string;
  content: string;
  createdAt: string;
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
