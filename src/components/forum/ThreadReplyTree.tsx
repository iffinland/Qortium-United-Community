// ===== Thread Reply Tree Component =====

import { useState } from 'react';
import { Reply, ChevronDown, ChevronRight } from 'lucide-react';
import type { ThreadReply } from '../../types/forum';
import ReplyForm from './ReplyForm';

interface ThreadReplyTreeProps {
  replies: ThreadReply[];
  threadId: string;
  parentId?: string | null;
  depth?: number;
}

const COLORS = [
  'border-cyan-400',
  'border-emerald-400',
  'border-amber-400',
  'border-rose-400',
  'border-violet-400',
  'border-blue-400',
];

const ThreadReplyTree = ({
  replies,
  threadId,
  parentId = null,
  depth = 0,
}: ThreadReplyTreeProps) => {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const levelReplies = replies.filter((r) => r.parentReplyId === parentId);
  if (levelReplies.length === 0) return null;

  const borderColor = COLORS[depth % COLORS.length];

  return (
    <>
      {levelReplies.map((reply) => {
        const children = replies.filter((r) => r.parentReplyId === reply.id);
        const hasChildren = children.length > 0;
        const isCollapsed = collapsed.has(reply.id);

        return (
          <div key={reply.id} className="relative">
            {/* Vertical line from parent */}
            {depth > 0 && (
              <div
                className={`absolute left-4 top-0 h-full w-0.5 ${borderColor} opacity-30`}
                style={{ marginLeft: `${(depth - 1) * 24}px` }}
              />
            )}

            <div
              className="relative"
              style={{ marginLeft: `${depth * 24}px` }}
            >
              {/* Horizontal connector */}
              {depth > 0 && (
                <div className={`absolute -left-6 top-5 h-0.5 w-6 ${borderColor} opacity-30`} />
              )}

              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-bold text-white">
                    {reply.authorName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">
                    {reply.authorName}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(reply.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {hasChildren && (
                    <button
                      onClick={() => {
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(reply.id)) next.delete(reply.id);
                          else next.add(reply.id);
                          return next;
                        });
                      }}
                      className="ml-auto rounded p-0.5 text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1 text-[10px]">{children.length}</span>
                    </button>
                  )}
                </div>
                <p className="mb-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {reply.content}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setReplyingTo(replyingTo === reply.id ? null : reply.id)
                    }
                    className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] transition hover:text-cyan-500"
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </button>
                </div>

                {/* Reply form */}
                {replyingTo === reply.id && (
                  <div className="mt-3">
                    <ReplyForm
                      threadId={threadId}
                      parentReplyId={reply.id}
                      replyToName={reply.authorName}
                      onCancel={() => setReplyingTo(null)}
                    />
                  </div>
                )}
              </div>

              {/* Children (recursive) */}
              {hasChildren && !isCollapsed && (
                <ThreadReplyTree
                  replies={replies}
                  threadId={threadId}
                  parentId={reply.id}
                  depth={depth + 1}
                />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default ThreadReplyTree;
