// ===== Projects RTK Query API =====
//
// Canonical project queries and mutations.
// Projects: qucp-project-{entityId}

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import {
  fetchValidatedProjects,
  reduceProjectResults,
} from '../../services/qdn/runtime/qdnRuntimeService';
import type { ReducedProjectListResult } from '../../services/qdn/runtime/projectRuntime';
import type { QdnDiagnostic } from '../../services/qdn/diagnostics';
import type { QucpProject, ProjectStatus } from '../../services/qdn/schemas/projectSchema';
import { isApprovedLifecycleTransition } from '../../services/qdn/schemas/projectSchema';

// ---- View Model Types ----

export interface ProjectView {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  imageEntityId?: string;
  website?: string;
  repository?: string;
  donationAddress?: string;
  fundingGoal?: number;
  ownerName: string;
  ownerAddress: string;
  createdAt: string;
  editedAt: string | null;
  isOwner: boolean;
}

export interface ProjectListResult {
  projects: ProjectView[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: readonly QdnDiagnostic[];
}

export interface ProjectDetailResult {
  project: ProjectView | null;
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: readonly QdnDiagnostic[];
}

// ---- Helpers ----

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

function toProjectView(
  project: ReducedProjectListResult['projects'][0],
  currentWallet: string,
): ProjectView {
  const snap = project.snapshot;
  const hasCreated = typeof snap.metadata.created === 'number';
  const hasEdited = typeof snap.data.editedAt === 'number';
  return {
    id: project.entityId,
    title: snap.data.title,
    description: snap.data.description,
    status: project.status,
    tags: snap.data.tags ?? [],
    imageEntityId: snap.data.imageEntityId,
    website: snap.data.website,
    repository: snap.data.repository,
    donationAddress: snap.data.donationAddress,
    fundingGoal: snap.data.fundingGoal,
    ownerName: project.canonicalOwnerName,
    ownerAddress: project.canonicalOwnerWallet,
    createdAt: hasCreated ? new Date(snap.metadata.created!).toISOString() : '',
    editedAt: hasEdited ? new Date(snap.data.editedAt!).toISOString() : null,
    isOwner: project.canonicalOwnerWallet === currentWallet,
  };
}

// ---- Publication Builders ----

export interface CreateProjectAuth {
  ownerName: string;
  ownerAddress: string;
}

export interface CreateProjectUserInput {
  entityId: string;
  title: string;
  description: string;
  status?: ProjectStatus;
  tags?: string[];
  imageEntityId?: string;
  website?: string;
  repository?: string;
  donationAddress?: string;
  fundingGoal?: number;
}

export interface CreateProjectResult {
  payload: QucpProject;
  identifier: string;
  error?: string;
}

/**
 * Build a canonical create-project payload from authenticated identity and user input.
 * Auth identity is injected separately — user input cannot override owner fields.
 */
export function buildCreateProjectPayload(
  auth: CreateProjectAuth,
  input: CreateProjectUserInput,
  now: number = Date.now(),
): CreateProjectResult {
  // Reject invalid initial statuses
  const status = input.status ?? 'planned';
  if (status !== 'planned' && status !== 'active') {
    return { payload: null as unknown as QucpProject, identifier: '', error: `Invalid initial status: ${status}. Must be planned or active.` };
  }

  // Reject fundingGoal without donationAddress
  if (typeof input.fundingGoal === 'number' && !input.donationAddress) {
    return { payload: null as unknown as QucpProject, identifier: '', error: 'fundingGoal requires donationAddress.' };
  }

  const identifier = buildQucpIdentifier('qucp-project', input.entityId);

  const payload: QucpProject = {
    schemaVersion: 1,
    resourceFamily: 'qucp-project',
    entityId: input.entityId,
    title: input.title,
    description: input.description,
    status,
    tags: input.tags,
    imageEntityId: input.imageEntityId,
    website: input.website,
    repository: input.repository,
    donationAddress: input.donationAddress,
    fundingGoal: input.fundingGoal,
    ownerName: auth.ownerName,
    ownerAddress: auth.ownerAddress,
    createdAt: now,
  };

  return { payload, identifier };
}

export interface UpdateProjectInput {
  title: string;
  description: string;
  status: ProjectStatus;
  tags?: string[];
  imageEntityId?: string;
  website?: string;
  repository?: string;
}

export interface UpdateProjectAuth {
  ownerName: string;
  ownerAddress: string;
}

export interface UpdateProjectResult {
  payload: QucpProject | null;
  identifier: string;
  error?: string;
}

/**
 * Build a canonical update-project payload.
 * Preserves all immutable fields from the current canonical project.
 * Rejects forbidden lifecycle transitions and archived updates early.
 */
export function buildUpdateProjectPayload(
  currentProject: QucpProject,
  auth: UpdateProjectAuth,
  input: UpdateProjectInput,
  now: number = Date.now(),
): UpdateProjectResult {
  // Owner authority check
  if (auth.ownerAddress !== currentProject.ownerAddress) {
    return { payload: null, identifier: '', error: 'Only the canonical owner may update this project.' };
  }

  // Archived is terminal
  if (currentProject.status === 'archived') {
    return { payload: null, identifier: '', error: 'Archived projects cannot be updated.' };
  }

  // Lifecycle check
  if (!isApprovedLifecycleTransition(currentProject.status, input.status)) {
    return { payload: null, identifier: '', error: `Invalid lifecycle transition: ${currentProject.status} → ${input.status}.` };
  }

  const identifier = buildQucpIdentifier('qucp-project', currentProject.entityId);

  const payload: QucpProject = {
    schemaVersion: currentProject.schemaVersion,
    resourceFamily: currentProject.resourceFamily,
    entityId: currentProject.entityId,
    title: input.title,
    description: input.description,
    status: input.status,
    tags: input.tags,
    imageEntityId: input.imageEntityId,
    website: input.website,
    repository: input.repository,
    donationAddress: currentProject.donationAddress,
    fundingGoal: currentProject.fundingGoal,
    ownerName: currentProject.ownerName,
    ownerAddress: currentProject.ownerAddress,
    createdAt: currentProject.createdAt,
    editedAt: now,
  };

  return { payload, identifier };
}

// ---- API Definition ----

export const projectApi = createApi({
  reducerPath: 'projectApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Projects'],
  endpoints: (builder) => ({

    // ----- Query: List all projects -----
    getProjects: builder.query<ProjectListResult, string>({
      queryFn: (currentWallet) => queryFn(async () => {
        const queryResult = await fetchValidatedProjects();
        const reduced = reduceProjectResults(queryResult);

        const projects = reduced.projects.map((p) => toProjectView(p, currentWallet));

        return {
          projects,
          completeness: reduced.completeness,
          diagnostics: reduced.diagnostics,
        };
      }),
      providesTags: ['Projects'],
    }),

    // ----- Query: Get single project -----
    getProject: builder.query<ProjectView | null, { entityId: string; currentWallet: string }>({
      queryFn: ({ entityId, currentWallet }) => queryFn(async () => {
        const queryResult = await fetchValidatedProjects();
        const reduced = reduceProjectResults(queryResult);

        const found = reduced.projects.find((p) => p.entityId === entityId);
        if (!found) return null;

        return toProjectView(found, currentWallet);
      }),
      providesTags: (_result, _error, { entityId }) => [{ type: 'Projects', id: entityId }],
    }),

    // ----- Mutation: Create project -----
    createProject: builder.mutation<
      { entityId: string },
      {
        entityId: string;
        title: string;
        description: string;
        status?: ProjectStatus;
        tags?: string[];
        imageEntityId?: string;
        website?: string;
        repository?: string;
        donationAddress?: string;
        fundingGoal?: number;
        ownerName: string;
        ownerAddress: string;
      }
    >({
      queryFn: async (input) => {
        try {
          const { ownerName, ownerAddress, ...userInput } = input;
          const result = buildCreateProjectPayload(
            { ownerName, ownerAddress },
            { ...userInput, status: userInput.status ?? 'planned' },
          );

          if (result.error) return { error: result.error };

          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: result.identifier,
            title: `Project: ${input.title}`,
            description: input.description.slice(0, 200),
            payload: result.payload,
            filename: `${input.entityId}.json`,
          });

          return { data: { entityId: input.entityId } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to create project.' };
        }
      },
      invalidatesTags: ['Projects'],
    }),

    // ----- Mutation: Update project -----
    updateProject: builder.mutation<
      { entityId: string },
      {
        entityId: string;
        title: string;
        description: string;
        status: ProjectStatus;
        tags?: string[];
        imageEntityId?: string;
        website?: string;
        repository?: string;
        ownerName: string;
        ownerAddress: string;
        // Immutable: donationAddress, fundingGoal
        existingDonationAddress?: string;
        existingFundingGoal?: number;
        existingCreatedAt: number;
      }
    >({
      queryFn: async (input) => {
        try {
          const currentProject: QucpProject = {
            schemaVersion: 1,
            resourceFamily: 'qucp-project',
            entityId: input.entityId,
            title: '', // not needed for builder — it only preserves immutable fields
            description: '', // not needed for builder
            status: input.status, // placeholder — builder uses input.status
            ownerName: input.ownerName,
            ownerAddress: input.ownerAddress,
            createdAt: input.existingCreatedAt,
            donationAddress: input.existingDonationAddress,
            fundingGoal: input.existingFundingGoal,
          };

          const result = buildUpdateProjectPayload(
            currentProject,
            { ownerName: input.ownerName, ownerAddress: input.ownerAddress },
            {
              title: input.title,
              description: input.description,
              status: input.status,
              tags: input.tags,
              imageEntityId: input.imageEntityId,
              website: input.website,
              repository: input.repository,
            },
          );

          if (result.error) return { error: result.error };
          if (!result.payload) return { error: 'Failed to build update payload.' };

          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: result.identifier,
            title: `Project: ${input.title}`,
            description: input.description.slice(0, 200),
            payload: result.payload,
            filename: `${input.entityId}.json`,
          });

          return { data: { entityId: input.entityId } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to update project.' };
        }
      },
      invalidatesTags: ['Projects'],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
} = projectApi;
