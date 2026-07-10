// ===== Sidebar Component =====

import { useGetPollsQuery, useGetProjectsQuery, useGetPostsQuery } from '../../store/api/qortiumApi';
import { BarChart3, FolderKanban, Users, Calendar, TrendingUp, Activity, MessageCircle, FileText, Vote } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'post' | 'comment' | 'vote';
  text: string;
  time: string;
  author: string;
}

const Sidebar = () => {
  const { data: polls } = useGetPollsQuery();
  const { data: projects } = useGetProjectsQuery();
  const { data: posts } = useGetPostsQuery();

  const activeProjects = projects?.filter((p) => p.status === 'active') ?? [];
  const activePolls = polls?.filter((p) => !p.closesAt || new Date(p.closesAt) > new Date()) ?? [];

  // Build recent activity feed from posts
  const recentActivity: ActivityItem[] = (posts ?? [])
    .flatMap((post): ActivityItem[] => [
      {
        id: `post-${post.id}`,
        type: 'post',
        text: `New post: "${post.title}"`,
        time: post.createdAt,
        author: post.authorName,
      },
    ])
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  const activityIcons = {
    post: FileText,
    comment: MessageCircle,
    vote: Vote,
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <aside className="w-full space-y-4 lg:w-72">
      {/* Community Stats */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          <TrendingUp className="h-3.5 w-3.5" />
          Community Stats
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <Users className="h-3.5 w-3.5 text-cyan-500" />
              Members
            </span>
            <span className="text-sm font-semibold tabular-nums">247</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <FolderKanban className="h-3.5 w-3.5 text-emerald-500" />
              Active Projects
            </span>
            <span className="text-sm font-semibold tabular-nums">{activeProjects.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
              Open Polls
            </span>
            <span className="text-sm font-semibold tabular-nums">{activePolls.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <Calendar className="h-3.5 w-3.5 text-rose-500" />
              Events this month
            </span>
            <span className="text-sm font-semibold tabular-nums">3</span>
          </div>
        </div>
      </div>

      {/* Active Polls */}
      {activePolls.length > 0 && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <BarChart3 className="h-3.5 w-3.5" />
            Active Polls
          </h3>
          <div className="space-y-3">
            {activePolls.slice(0, 3).map((poll) => {
              const maxVotes = Math.max(...poll.options.map((o) => o.voteCount), 1);
              return (
                <div key={poll.id} className="space-y-1">
                  <p className="text-sm font-medium leading-snug text-[var(--color-text-primary)]">
                    {poll.question}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <span>{poll.totalVotes} votes</span>
                    <span>·</span>
                    <span>
                      {poll.closesAt
                        ? `Ends ${new Date(poll.closesAt).toLocaleDateString('en-US')}`
                        : 'No deadline'}
                    </span>
                  </div>
                  {/* Simple bar visualization for top option */}
                  <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all"
                      style={{
                        width: `${Math.round((poll.options[0].voteCount / maxVotes) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <FolderKanban className="h-3.5 w-3.5" />
            Active Projects
          </h3>
          <div className="space-y-3">
            {activeProjects.slice(0, 3).map((project) => (
              <div key={project.id} className="space-y-1">
                <p className="text-sm font-medium leading-snug text-[var(--color-text-primary)]">
                  {project.title}
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
                    {project.progress}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <Activity className="h-3.5 w-3.5" />
            Recent Activity
          </h3>
          <div className="space-y-2.5">
            {recentActivity.map((item) => {
              const Icon = activityIcons[item.type];
              return (
                <div key={item.id} className="flex gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-[var(--color-text-secondary)]">
                      {item.text}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {item.author} · {timeAgo(item.time)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
