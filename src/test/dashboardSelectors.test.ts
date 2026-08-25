// ===== Dashboard Selector Regression Tests =====

import { describe, expect, it } from 'vitest';
import {
  countActivePolls,
  countActiveProjects,
  countEventsThisMonth,
  isPollOpen,
} from '../services/dashboard/dashboardStats';
import {
  latestDashboardActivity,
  type DashboardActivityCandidate,
} from '../services/dashboard/dashboardActivity';
import {
  buildActiveForumDiscussions,
  type ForumDiscussionReplyInput,
  type ForumDiscussionThreadInput,
} from '../services/dashboard/forumActivity';

describe('dashboard community stats', () => {
  it('counts only projects in the active lifecycle state', () => {
    expect(
      countActiveProjects([
        { status: 'active' },
        { status: 'planned' },
        { status: 'completed' },
        { status: 'archived' },
        { status: 'active' },
      ]),
    ).toBe(2);
  });

  it('returns zero for an empty or all-non-active project list', () => {
    expect(countActiveProjects([])).toBe(0);
    expect(countActiveProjects([{ status: 'planned' }, { status: 'archived' }])).toBe(0);
  });

  it('counts only open polls using the existing poll lifecycle', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    expect(
      countActivePolls(
        [
          { isClosed: false, expiresAt: null },
          { isClosed: true, expiresAt: null },
          { isClosed: false, expiresAt: '2026-08-24T00:00:00.000Z' },
          { isClosed: false, expiresAt: '2026-08-22T00:00:00.000Z' },
          { isClosed: false, expiresAt: 'not-a-date' },
        ],
        now,
      ),
    ).toBe(2);
  });

  it('treats a poll with no expiry as open when not explicitly closed', () => {
    expect(isPollOpen({ isClosed: false, expiresAt: null })).toBe(true);
  });

  it('returns zero when there are no active polls', () => {
    expect(countActivePolls([], new Date())).toBe(0);
    expect(
      countActivePolls(
        [{ isClosed: true, expiresAt: null }],
        new Date('2026-08-23T12:00:00.000Z'),
      ),
    ).toBe(0);
  });

  it('truthfully counts zero events when no canonical event source is supplied', () => {
    expect(countEventsThisMonth([], new Date('2026-08-23T12:00:00.000Z'))).toBe(0);
  });

  it('provides an events seam that counts only starts in the current calendar month', () => {
    const now = new Date(2026, 7, 23, 12, 0, 0);
    expect(
      countEventsThisMonth(
        [
          { startDate: '2026-08-01T00:00:00' },
          { startDate: '2026-08-31T23:59:59' },
          { startDate: '2026-09-01T00:00:00' },
          { startDate: 'invalid' },
        ],
        now,
      ),
    ).toBe(2);
  });
});

describe('dashboard recent activity', () => {
  const candidate = (
    id: string,
    domain: DashboardActivityCandidate['domain'],
    timestamps: Array<string | null | undefined>,
  ): DashboardActivityCandidate => ({
    id,
    domain,
    entityId: id,
    title: `${domain} ${id}`,
    authorName: 'Alice',
    timestamps,
    path: `/item/${id}`,
  });

  it('normalizes supported domains and sorts newest first', () => {
    const result = latestDashboardActivity([
      candidate('old-post', 'post', ['2026-08-01T00:00:00.000Z']),
      candidate('new-wiki', 'wiki', ['2026-08-20T00:00:00.000Z']),
      candidate('new-project', 'project', ['2026-08-19T00:00:00.000Z']),
      candidate('new-poll', 'poll', ['2026-08-18T00:00:00.000Z']),
    ]);

    expect(result.map((item) => item.id)).toEqual([
      'new-wiki',
      'new-project',
      'new-poll',
      'old-post',
    ]);
  });

  it('uses the newest authoritative timestamp candidate for each item', () => {
    const result = latestDashboardActivity([
      candidate('edited-post', 'post', [
        '2026-08-01T00:00:00.000Z',
        '2026-08-21T00:00:00.000Z',
      ]),
    ]);

    expect(result[0].occurredAt).toBe('2026-08-21T00:00:00.000Z');
  });

  it('selects only the latest five items', () => {
    const result = latestDashboardActivity(
      Array.from({ length: 8 }, (_, index) =>
        candidate(
          `post-${index}`,
          'post',
          [`2026-08-${String(index + 10).padStart(2, '0')}T00:00:00.000Z`],
        ),
      ),
    );

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('post-7');
  });

  it('omits items with missing or invalid authoritative timestamps', () => {
    const result = latestDashboardActivity([
      candidate('missing', 'post', [null, undefined]),
      candidate('invalid', 'post', ['not-a-date']),
      candidate('valid', 'post', ['2026-08-23T00:00:00.000Z']),
    ]);

    expect(result.map((item) => item.id)).toEqual(['valid']);
  });
});

describe('dashboard active forum discussions', () => {
  const thread = (
    id: string,
    createdAtMs: number | null,
  ): ForumDiscussionThreadInput => ({
    id,
    categoryId: 'general',
    title: `Thread ${id}`,
    createdAtMs,
  });

  const reply = (
    id: string,
    threadId: string,
    createdAtMs: number | null,
  ): ForumDiscussionReplyInput => ({
    id,
    threadId,
    createdAtMs,
  });

  it('uses the latest reply when it is newer than thread creation', () => {
    const result = buildActiveForumDiscussions(
      [
        thread('a', 1000),
        thread('b', 1000),
      ],
      [
        reply('r1', 'a', 3000),
        reply('r2', 'a', 2000),
        reply('r3', 'b', 900),
      ],
    );

    expect(result[0].id).toBe('a');
    expect(result[0].lastActivityAt).toBe('1970-01-01T00:00:03.000Z');
    expect(result[0].replyCount).toBe(2);
  });

  it('uses thread creation time when there are no replies', () => {
    const result = buildActiveForumDiscussions(
      [thread('a', 1000), thread('b', 3000)],
      [],
    );

    expect(result.map((item) => item.id)).toEqual(['b', 'a']);
    expect(result[0].replyCount).toBe(0);
  });

  it('selects the newest five threads and keeps real reply counts', () => {
    const threads = Array.from({ length: 8 }, (_, index) =>
      thread(`thread-${index}`, index + 1),
    );
    const replies = [
      reply('r1', 'thread-7', 1000),
      reply('r2', 'thread-7', 1001),
    ];

    const result = buildActiveForumDiscussions(threads, replies);

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('thread-7');
    expect(result[0].replyCount).toBe(2);
  });

  it('returns an empty state when no threads exist', () => {
    expect(buildActiveForumDiscussions([], [])).toEqual([]);
  });

  it('omits threads with no usable authoritative timestamp', () => {
    const result = buildActiveForumDiscussions(
      [
        thread('missing', null),
        thread('valid', 1000),
      ],
      [],
    );

    expect(result.map((item) => item.id)).toEqual(['valid']);
  });
});
