// ===== Application-Wide Global Search =====
//
// Uses the current canonical QDN runtime/discovery functions, not fabricated
// data. It performs bounded, validated reads for public application domains
// and produces UI-safe navigation/highlight metadata.

import type { UserRole } from '../../types';
import type {
  ValidatedResource,
  ValidatedRuntimeQueryResult,
} from '../qdn/runtime/runtimeTypes';
import {
  fetchValidatedPosts,
  fetchValidatedForumTopics,
  fetchValidatedForumReplies,
  fetchValidatedProjects,
  fetchValidatedPolls,
  fetchValidatedWiki,
  fetchValidatedEvents,
  fetchValidatedSupportTickets,
} from '../qdn/runtime/qdnRuntimeService';
import { toPlainTextPreview } from '../rich-text/richText';
import {
  includesSearchTerm,
  normalizeSearchTerm,
  scoreSearchCandidate,
} from './searchMatching';

// ---- Public Types ----

export type SearchDomain =
  | 'post'
  | 'forum-topic'
  | 'forum-reply'
  | 'project'
  | 'poll'
  | 'wiki'
  | 'event'
  | 'support-ticket';

/** Per-domain search state. `skipped` is used for a domain not searched. */
export type SearchDomainStatus =
  | 'complete'
  | 'incomplete'
  | 'unavailable'
  | 'empty'
  | 'skipped';

export interface GlobalSearchViewer {
  isAuthenticated?: boolean;
  currentAddress?: string | null;
  role?: UserRole;
}

export interface GlobalSearchResult {
  key: string;
  domain: SearchDomain;
  title: string;
  body: string;
  href: string;
  /** The string this result matched in its title, when the title matched. */
  titleMatch: string;
}

export interface GlobalSearchResponse {
  query: string;
  results: GlobalSearchResult[];
  /** Per-domain search state for every intended domain. */
  domainStatus: Record<SearchDomain, SearchDomainStatus>;
  /** True only when every intended domain completed (complete or empty). */
  complete: boolean;
  /** True when at least one intended domain was incomplete or unavailable. */
  degraded: boolean;
  /** Intended domains that were incomplete or unavailable. */
  degradedDomains: SearchDomain[];
}

// ---- Authorization / Privacy ----

/**
 * Support is searchable only for an authenticated Qortium Home viewer.
 * This deliberately does not widen Support exposure to the public/gateway
 * search path even though the current Support page itself is app-visible.
 */
export function shouldIncludeSupportTickets(viewer: GlobalSearchViewer): boolean {
  return viewer.isAuthenticated === true;
}

// ---- Fetch Helpers ----

interface DomainOutcome<T> {
  status: SearchDomainStatus;
  items: ValidatedResource<T>[];
}

async function safeDomain<T>(
  loader: () => Promise<ValidatedRuntimeQueryResult<T>>,
): Promise<DomainOutcome<T>> {
  try {
    const result = await loader();
    return {
      status: result.status,
      items:
        result.status === 'unavailable' || result.status === 'empty'
          ? []
          : result.items,
    };
  } catch {
    // A single domain failure should not hide results from healthy domains.
    return { status: 'unavailable', items: [] };
  }
}

function asData<T>(item: ValidatedResource<T>): Record<string, unknown> {
  return item.envelope.data as Record<string, unknown>;
}

function joinedText(parts: Array<string | undefined | null>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
}

function withScore(
  candidate: Omit<GlobalSearchResult, 'titleMatch'>,
  normalizedTerm: string,
): GlobalSearchResult {
  const titleMatch = includesSearchTerm(candidate.title, normalizedTerm)
    ? candidate.title
    : '';
  return {
    ...candidate,
    titleMatch,
    __score: scoreSearchCandidate(candidate.title, candidate.body, normalizedTerm),
  } as GlobalSearchResult & { __score: number };
}

// ---- Domain Candidate Builders ----

function postCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.title === 'string' ? d.title : '';
  const content = toPlainTextPreview(typeof d.content === 'string' ? d.content : '');
  const body = joinedText([content, d.ownerName as string | undefined, ...stringArray(d.tags)]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `post:${item.entityId}`,
    domain: 'post',
    title,
    body,
    href: `/post/${item.entityId}`,
  }, normalizedTerm);
}

function topicCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.title === 'string' ? d.title : '';
  const content = toPlainTextPreview(typeof d.content === 'string' ? d.content : '');
  const body = joinedText([content, d.ownerName as string | undefined, ...stringArray(d.tags)]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `forum-topic:${item.entityId}`,
    domain: 'forum-topic',
    title,
    body,
    href: `/forum/${String(d.categoryId ?? 'general')}/${item.entityId}`,
  }, normalizedTerm);
}

function replyCandidate<T>(
  item: ValidatedResource<T>,
  topicTitleByEntityId: Map<string, string>,
  categoryByTopicEntityId: Map<string, string>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const content = toPlainTextPreview(typeof d.content === 'string' ? d.content : '');
  const owner = typeof d.ownerName === 'string' ? d.ownerName : '';
  const parentEntityId = typeof d.parentEntityId === 'string' ? d.parentEntityId : '';
  const category = categoryByTopicEntityId.get(parentEntityId);
  if (!category) return null;

  const parentTitle = topicTitleByEntityId.get(parentEntityId) ?? 'Forum topic';
  const title = `Reply to ${parentTitle}`;
  const body = joinedText([content, owner]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `forum-reply:${item.entityId}`,
    domain: 'forum-reply',
    title,
    body,
    href: `/forum/${category}/${parentEntityId}`,
  }, normalizedTerm);
}

function projectCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.title === 'string' ? d.title : '';
  const body = joinedText([
    toPlainTextPreview(typeof d.description === 'string' ? d.description : ''),
    d.ownerName as string | undefined,
    d.category as string | undefined,
    d.status as string | undefined,
    ...stringArray(d.tags),
  ]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `project:${item.entityId}`,
    domain: 'project',
    title,
    body,
    href: `/project/${item.entityId}`,
  }, normalizedTerm);
}

function pollCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.question === 'string' ? d.question : '';
  const optionLabels = Array.isArray(d.options)
    ? (d.options as Array<Record<string, unknown>>)
        .map((option) => (typeof option.label === 'string' ? option.label : ''))
        .filter(Boolean)
    : [];
  const body = joinedText([
    toPlainTextPreview(typeof d.description === 'string' ? d.description : ''),
    d.ownerName as string | undefined,
    ...optionLabels,
  ]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `poll:${item.entityId}`,
    domain: 'poll',
    title,
    body,
    href: '/polls',
  }, normalizedTerm);
}

function wikiCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.title === 'string' ? d.title : '';
  const body = joinedText([
    toPlainTextPreview(typeof d.content === 'string' ? d.content : ''),
    d.summary as string | undefined,
    d.ownerName as string | undefined,
    ...stringArray(d.tags),
  ]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `wiki:${item.entityId}`,
    domain: 'wiki',
    title,
    body,
    href: `/wiki/article/${item.entityId}`,
  }, normalizedTerm);
}

function eventCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.title === 'string' ? d.title : '';
  const body = joinedText([
    toPlainTextPreview(typeof d.description === 'string' ? d.description : ''),
    d.category as string | undefined,
    d.location as string | undefined,
    d.ownerName as string | undefined,
  ]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `event:${item.entityId}`,
    domain: 'event',
    title,
    body,
    href: '/events',
  }, normalizedTerm);
}

function supportCandidate<T>(
  item: ValidatedResource<T>,
  normalizedTerm: string,
): GlobalSearchResult | null {
  const d = asData(item);
  const title = typeof d.title === 'string' ? d.title : '';
  const body = joinedText([
    toPlainTextPreview(typeof d.description === 'string' ? d.description : ''),
    d.type as string | undefined,
    d.ownerName as string | undefined,
  ]);
  if (!includesSearchTerm(title, normalizedTerm) && !includesSearchTerm(body, normalizedTerm)) return null;
  return withScore({
    key: `support-ticket:${item.entityId}`,
    domain: 'support-ticket',
    title,
    body,
    href: `/support/${item.entityId}`,
  }, normalizedTerm);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
}

// ---- Main Search ----

export async function searchGlobalContent(
  query: string,
  viewer: GlobalSearchViewer,
): Promise<GlobalSearchResponse> {
  const normalizedTerm = normalizeSearchTerm(query);
  if (!normalizedTerm) {
    return {
      query: '',
      results: [],
      domainStatus: emptyDomainStatus(),
      complete: true,
      degraded: false,
      degradedDomains: [],
    };
  }

  const includeSupport = shouldIncludeSupportTickets(viewer);

  const [
    postsOutcome,
    topicsOutcome,
    repliesOutcome,
    projectsOutcome,
    pollsOutcome,
    wikiOutcome,
    eventsOutcome,
    supportOutcome,
  ] = await Promise.all([
    safeDomain(fetchValidatedPosts),
    safeDomain(fetchValidatedForumTopics),
    safeDomain(fetchValidatedForumReplies),
    safeDomain(fetchValidatedProjects),
    safeDomain(fetchValidatedPolls),
    safeDomain(fetchValidatedWiki),
    safeDomain(fetchValidatedEvents),
    includeSupport
      ? safeDomain(fetchValidatedSupportTickets)
      : Promise.resolve<DomainOutcome<unknown>>({ status: 'skipped', items: [] }),
  ]);

  const posts = postsOutcome.items;
  const topics = topicsOutcome.items;
  const replies = repliesOutcome.items;
  const projects = projectsOutcome.items;
  const polls = pollsOutcome.items;
  const wiki = wikiOutcome.items;
  const events = eventsOutcome.items;
  const supportTickets = includeSupport ? supportOutcome.items : [];

  const domainStatus: Record<SearchDomain, SearchDomainStatus> = {
    post: postsOutcome.status,
    'forum-topic': topicsOutcome.status,
    'forum-reply': repliesOutcome.status,
    project: projectsOutcome.status,
    poll: pollsOutcome.status,
    wiki: wikiOutcome.status,
    event: eventsOutcome.status,
    'support-ticket': supportOutcome.status,
  };

  const topicTitleByEntityId = new Map<string, string>();
  const categoryByTopicEntityId = new Map<string, string>();
  for (const topic of topics) {
    const d = asData(topic);
    topicTitleByEntityId.set(
      topic.entityId,
      typeof d.title === 'string' ? d.title : 'Forum topic',
    );
    if (typeof d.categoryId === 'string') {
      categoryByTopicEntityId.set(topic.entityId, d.categoryId);
    }
  }

  const candidates: GlobalSearchResult[] = [];
  for (const item of posts) {
    const candidate = postCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of topics) {
    const candidate = topicCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of replies) {
    const candidate = replyCandidate(item, topicTitleByEntityId, categoryByTopicEntityId, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of projects) {
    const candidate = projectCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of polls) {
    const candidate = pollCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of wiki) {
    const candidate = wikiCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of events) {
    const candidate = eventCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }
  for (const item of supportTickets) {
    const candidate = supportCandidate(item, normalizedTerm);
    if (candidate) candidates.push(candidate);
  }

  const ranked = candidates
    .sort((a, b) => {
      const scoreA = (a as GlobalSearchResult & { __score: number }).__score;
      const scoreB = (b as GlobalSearchResult & { __score: number }).__score;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
    })
    .map((result) => {
      const candidate = result as GlobalSearchResult & { __score: number };
      return {
        key: candidate.key,
        domain: candidate.domain,
        title: candidate.title,
        body: candidate.body,
        href: candidate.href,
        titleMatch: candidate.titleMatch,
      };
    })
    .slice(0, 8);

  const degradedDomains = (
    Object.keys(domainStatus) as SearchDomain[]
  ).filter((domain) => {
    const status = domainStatus[domain];
    return status === 'incomplete' || status === 'unavailable';
  });

  return {
    query: normalizedTerm,
    results: ranked,
    domainStatus,
    complete: degradedDomains.length === 0,
    degraded: degradedDomains.length > 0,
    degradedDomains,
  };
}

function emptyDomainStatus(): Record<SearchDomain, SearchDomainStatus> {
  return {
    post: 'skipped',
    'forum-topic': 'skipped',
    'forum-reply': 'skipped',
    project: 'skipped',
    poll: 'skipped',
    wiki: 'skipped',
    event: 'skipped',
    'support-ticket': 'skipped',
  };
}
