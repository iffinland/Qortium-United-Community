// ===== Sidebar Component =====

import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  FileText,
  FolderKanban,
  MessageCircle,
  TrendingUp,
  Vote,
} from 'lucide-react';
import { useGetPostsQuery } from '../../store/api/qortiumApi';
import { useGetProjectsQuery, type ProjectView } from '../../store/api/projectApi';
import { useGetPollsQuery, type PollView } from '../../store/api/pollApi';
import { useGetWikiListQuery } from '../../store/api/wikiApi';
import { useGetEventsQuery, type EventView } from '../../store/api/eventApi';
import { useGetActiveDiscussionsQuery } from '../../store/api/forumApi';
import { useAppSelector } from '../../store';
import {
  countActivePolls,
  countActiveProjects,
  countEventsThisMonth,
  isPollOpen,
} from '../../services/dashboard/dashboardStats';
import {
  latestDashboardActivity,
  type DashboardActivityCandidate,
  type DashboardActivityDomain,
  type DashboardActivityItem,
} from '../../services/dashboard/dashboardActivity';
import type { Post } from '../../types';
import type { WikiArticleView } from '../../types/wiki';

interface RecentActivityInputs {
  posts: Post[];
  projects: ProjectView[];
  polls: PollView[];
  wikiArticles: WikiArticleView[];
  events: EventView[];
}

function buildRecentActivity(input: RecentActivityInputs): DashboardActivityItem[] {
  const candidates: DashboardActivityCandidate[] = [
    ...input.posts.map((post) => ({
      id: `post-${post.id}`,
      domain: 'post' as DashboardActivityDomain,
      entityId: post.id,
      title: post.title,
      authorName: post.authorName,
      timestamps: [post.createdAt, post.updatedAt],
      path: `/post/${post.id}`,
    })),
    ...input.projects.map((project) => ({
      id: `project-${project.id}`,
      domain: 'project' as DashboardActivityDomain,
      entityId: project.id,
      title: project.title,
      authorName: project.ownerName,
      timestamps: [project.createdAt],
      path: `/project/${project.id}`,
    })),
    ...input.polls.map((poll) => ({
      id: `poll-${poll.id}`,
      domain: 'poll' as DashboardActivityDomain,
      entityId: poll.id,
      title: poll.question,
      authorName: poll.ownerName,
      timestamps: [poll.createdAt],
      path: '/polls',
    })),
    ...input.wikiArticles.map((article) => ({
      id: `wiki-${article.entityId}`,
      domain: 'wiki' as DashboardActivityDomain,
      entityId: article.entityId,
      title: article.title,
      authorName: article.publisherName,
      timestamps: [article.createdAt, article.updatedAt],
      path: `/wiki/article/${article.entityId}`,
    })),
    ...input.events.map((event) => ({
      id: `event-${event.entityId}`,
      domain: 'event' as DashboardActivityDomain,
      entityId: event.entityId,
      title: event.title,
      authorName: event.ownerName,
      timestamps: [event.createdAt, event.editedAt],
      path: '/events',
    })),
  ];

  return latestDashboardActivity(candidates, 5);
}

const ACTIVITY_ICONS: Record<DashboardActivityDomain, typeof FileText> = {
  post: FileText,
  project: FolderKanban,
  poll: Vote,
  wiki: BookOpen,
  event: Calendar,
};

const ACTIVITY_LABELS: Record<DashboardActivityDomain, string> = {
  post: 'Post',
  project: 'Project',
  poll: 'Poll',
  wiki: 'Wiki',
  event: 'Event',
};

const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Unknown';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const Sidebar = () => {
  const walletAddress = useAppSelector((state) => state.auth.address ?? '');
  const {
    data: projectData,
    isLoading: projectsLoading,
    error: projectsError,
  } = useGetProjectsQuery(walletAddress);
  const { data: posts } = useGetPostsQuery();
  const {
    data: pollData,
    isLoading: pollsLoading,
    error: pollsError,
  } = useGetPollsQuery(walletAddress);
  const { data: wikiData } = useGetWikiListQuery();
  const {
    data: eventData,
    isLoading: eventsLoading,
    error: eventsError,
  } = useGetEventsQuery(walletAddress);
  const {
    data: forumData,
    isLoading: forumLoading,
    error: forumError,
  } = useGetActiveDiscussionsQuery();

  const projects = projectData?.projects ?? [];
  const projectCompleteness =
    projectData?.completeness ??
    (projectsError ? 'unavailable' : projectsLoading ? 'loading' : 'empty');
  const polls = pollData?.polls ?? [];
  const pollCompleteness =
    pollData?.completeness ??
    (pollsError ? 'unavailable' : pollsLoading ? 'loading' : 'empty');
  const eventCompleteness =
    eventData?.status ??
    (eventsError ? 'unavailable' : eventsLoading ? 'loading' : 'empty');

  const activeProjects = countActiveProjects(projects);
  const activePolls = countActivePolls(polls);
  const activeEvents = (eventData?.events ?? []).filter((event) => event.status === 'active');
  const eventsThisMonth = countEventsThisMonth(
    activeEvents.map((event) => ({ startDate: event.startDate })),
  );

  const recentActivity = buildRecentActivity({
    posts: posts ?? [],
    projects,
    polls,
    wikiArticles: wikiData?.articles ?? [],
    events: activeEvents,
  });

  const forumDiscussions = forumData?.items ?? [];
  const forumCompleteness = forumError
    ? 'unavailable'
    : forumData?.completeness ?? 'empty';

  const showStatsWarning =
    projectCompleteness === 'incomplete' ||
    pollCompleteness === 'incomplete' ||
    eventCompleteness === 'incomplete' ||
    projectCompleteness === 'unavailable' ||
    pollCompleteness === 'unavailable' ||
    eventCompleteness === 'unavailable';

  const activitySourcesMayBeIncomplete =
    projectCompleteness === 'incomplete' ||
    projectCompleteness === 'unavailable' ||
    pollCompleteness === 'incomplete' ||
    pollCompleteness === 'unavailable' ||
    wikiData?.status === 'incomplete' ||
    wikiData?.status === 'unavailable' ||
    eventData?.status === 'incomplete' ||
    eventData?.status === 'unavailable';

  const renderCounter = (
    value: number,
    completeness: string,
    loading: boolean,
  ) => {
    if (loading) return '—';
    if (completeness === 'unavailable') return 'Unavailable';
    return value;
  };

  return (
    <aside className="w-full space-y-4">
      {/* Community Stats */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          <TrendingUp className="h-3.5 w-3.5" />
          Community Stats
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <FolderKanban className="h-3.5 w-3.5 text-emerald-500" />
              Active Projects
            </span>
            <span
              data-testid="community-stats-active-projects"
              className="text-sm font-semibold tabular-nums"
            >
              {renderCounter(
                activeProjects,
                projectCompleteness,
                projectsLoading,
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <Vote className="h-3.5 w-3.5 text-cyan-500" />
              Active Polls
            </span>
            <span
              data-testid="community-stats-active-polls"
              className="text-sm font-semibold tabular-nums"
            >
              {renderCounter(activePolls, pollCompleteness, pollsLoading)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
              <Calendar className="h-3.5 w-3.5 text-rose-500" />
              Events This Month
            </span>
            <span
              data-testid="community-stats-events-this-month"
              className="text-sm font-semibold tabular-nums"
            >
              {renderCounter(eventsThisMonth, eventCompleteness, eventsLoading)}
            </span>
          </div>
        </div>

        {showStatsWarning && (
          <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-800 bg-amber-950 px-2 py-1.5 text-[0.625rem] leading-tight text-amber-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>Some stats may be incomplete or unavailable.</span>
          </div>
        )}
      </div>

      {/* Active Polls */}
      {activePolls > 0 && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <BarChart3 className="h-3.5 w-3.5" />
            Active Polls
          </h3>
          <div className="space-y-3">
            {polls
              .filter((poll) => isPollOpen(poll))
              .slice(0, 3)
              .map((poll) => {
                const maxVotes = Math.max(
                  ...poll.options.map((option) => option.voteCount),
                  1,
                );
                return (
                  <div key={poll.id} className="space-y-1">
                    <p className="text-sm font-medium leading-snug text-[var(--color-text-primary)]">
                      {poll.question}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <span>{poll.totalVotes} votes</span>
                      <span>·</span>
                      <span>
                        {poll.expiresAt
                          ? `Ends ${new Date(poll.expiresAt).toLocaleDateString('en-US')}`
                          : 'No deadline'}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all"
                        style={{
                          width: `${Math.round(
                            ((poll.options[0]?.voteCount ?? 0) / maxVotes) * 100,
                          )}%`,
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
      {projects.filter((project) => project.status === 'active').length > 0 && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <FolderKanban className="h-3.5 w-3.5" />
            Active Projects
          </h3>
          <div className="space-y-3">
            {projects
              .filter((project) => project.status === 'active')
              .slice(0, 3)
              .map((project) => (
                <div key={project.id} className="space-y-1">
                  <p className="text-sm font-medium leading-snug text-[var(--color-text-primary)]">
                    {project.title}
                  </p>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {project.status}
                  </span>
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
          {activitySourcesMayBeIncomplete && (
            <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-800 bg-amber-950 px-2 py-1.5 text-[0.625rem] leading-tight text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Recent activity may be incomplete.</span>
            </div>
          )}
          <div className="space-y-2.5">
            {recentActivity.map((item) => {
              const Icon = ACTIVITY_ICONS[item.domain];
              const label = ACTIVITY_LABELS[item.domain];
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className="flex gap-2 rounded-md px-1 py-0.5 transition hover:bg-[var(--color-surface-muted)]"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-[var(--color-text-secondary)]">
                      <span className="font-medium text-[var(--color-text-primary)]">
                        {label}
                      </span>
                      {' · '}
                      {item.title}
                    </p>
                    <p className="text-[0.625rem] text-[var(--color-text-muted)]">
                      {item.authorName} · {timeAgo(item.occurredAt)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Forum Discussions */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          <MessageCircle className="h-3.5 w-3.5" />
          Active Forum Discussions
        </h3>

        {forumLoading ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Loading forum activity...
          </p>
        ) : forumCompleteness === 'unavailable' ? (
          <div className="rounded-md border border-amber-800 bg-amber-950 p-3 text-xs text-amber-400">
            Forum activity is currently unavailable.
          </div>
        ) : forumDiscussions.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No forum discussions yet.
          </p>
        ) : (
          <>
            {forumCompleteness === 'incomplete' && (
              <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-800 bg-amber-950 px-2 py-1.5 text-[0.625rem] leading-tight text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>Forum activity and reply counts may be incomplete.</span>
              </div>
            )}
            <div className="space-y-2.5">
              {forumDiscussions.map((thread) => (
                <Link
                  key={thread.id}
                  to={`/forum/${thread.categoryId}/${thread.id}`}
                  className="block rounded-md px-1 py-0.5 transition hover:bg-[var(--color-surface-muted)]"
                >
                  <p className="truncate text-xs font-medium text-[var(--color-text-primary)]">
                    {thread.title}
                  </p>
                  <p className="text-[0.625rem] text-[var(--color-text-muted)]">
                    {thread.categoryName}
                    {' · '}
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {timeAgo(thread.lastActivityAt)}
                    {' · '}
                    {thread.replyCount} replies
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
