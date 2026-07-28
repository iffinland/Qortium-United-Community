// ===== Project Runtime =====

import type { QucpProject } from '../schemas/projectSchema';
import type { ValidatedRuntimeQueryResult } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { projectPolicy } from '../policies/projectPolicy';
import { reduceProjectSnapshots, type ReducedProject } from './projectSnapshotReducer';

export type { ReducedProject };
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Search Prefix ----

export const PROJECT_SEARCH_PREFIX = 'qucp-project-' as const;

// ---- Query Result ----

export type ProjectQueryResult = ValidatedRuntimeQueryResult<QucpProject>;

export interface ReducedProjectListResult {
  projects: ReducedProject[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: QdnDiagnostic[];
}

// ---- Payload Parser ----

function parseProjectPayload(raw: unknown): QucpProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-project') return null;
  return d as QucpProject;
}

// ---- Query Function ----

export async function queryProjects(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<ProjectQueryResult> {
  return validatedRuntimeQuery<QucpProject>(searchFn, fetchFn, parseProjectPayload, projectPolicy, identityResolver, {
    service: params?.service ?? 'DOCUMENT',
    identifierPrefix: params?.identifierPrefix ?? PROJECT_SEARCH_PREFIX,
    pageSize: params?.pageSize,
    safetyMax: params?.safetyMax,
    signal: params?.signal,
  });
}

// ---- Reduction ----

export function reduceProjectResults(
  queryResult: ProjectQueryResult,
): ReducedProjectListResult {
  if (queryResult.status === 'unavailable' || queryResult.status === 'empty') {
    return { projects: [], completeness: queryResult.status, diagnostics: queryResult.diagnostics ?? [] };
  }

  // Group by entityId
  const byEntityId = new Map<string, QdnResourceEnvelope<QucpProject>[]>();
  for (const item of queryResult.items) {
    const data = item.envelope.data as Record<string, unknown>;
    const eid = typeof data.entityId === 'string' ? data.entityId : '';
    if (!eid) continue;
    const existing = byEntityId.get(eid) ?? [];
    existing.push(item.envelope);
    byEntityId.set(eid, existing);
  }

  const projects: ReducedProject[] = [];
  const allDiags: QdnDiagnostic[] = [...(queryResult.diagnostics ?? [])];

  for (const [entityId, envelopes] of byEntityId) {
    const reduction = reduceProjectSnapshots(entityId, envelopes);
    if (reduction.project) projects.push(reduction.project);
    allDiags.push(...reduction.diagnostics);
  }

  const completeness = queryResult.status === 'complete' ? 'complete' as const : 'incomplete' as const;

  return {
    projects,
    completeness: projects.length === 0 && completeness === 'complete' ? 'empty' : completeness,
    diagnostics: allDiags,
  };
}

// ---- Project List Ordering ----

/**
 * Sort project list deterministically by trusted QDN metadata.
 * Primary: metadata.updated descending (most recently updated first).
 * Secondary: metadata.created descending.
 * Tie-break: entityId (stable alphabetical).
 */
export function sortProjectList(projects: ReducedProject[]): ReducedProject[] {
  return [...projects].sort((a, b) => {
    const aUpd = a.snapshot.metadata.updated ?? 0;
    const bUpd = b.snapshot.metadata.updated ?? 0;
    if (aUpd !== bUpd) return bUpd - aUpd;
    const aCre = a.snapshot.metadata.created ?? 0;
    const bCre = b.snapshot.metadata.created ?? 0;
    if (aCre !== bCre) return bCre - aCre;
    return a.entityId.localeCompare(b.entityId);
  });
}
