// ===== QDN Foundation — Public API =====

// Envelope
export {
  type QdnResourceMetadata,
  type QdnResourceEnvelope,
  createResourceEnvelope,
  extractMetadata,
  metadataDedupeKey,
} from './QdnResourceEnvelope';

// Validation types
export {
  type ValidationStatus,
  type ValidationReasonCode,
  ValidationReasonCodes,
  type ValidationDiagnostic,
  type AcceptedValidation,
  type RejectedValidation,
  type QuarantinedValidation,
  type ValidationResult,
  type ValidationBatchResult,
  accepted,
  rejected,
  quarantined,
} from './validationTypes';

// Errors
export {
  type BridgeErrorCode,
  type QdnErrorCode,
  BridgeError,
  QdnError,
  isBridgeError,
  isQdnError,
} from './qdnErrors';

// Diagnostics
export {
  type QdnDiagnostic,
  infoDiag,
  warningDiag,
  errorDiag,
  sanitizeDiag,
} from './diagnostics';

// Identity resolver
export {
  type ResolutionStatus,
  type IdentityResolution,
  type NameLookupFn,
  type IdentityResolverOptions,
  IdentityResolver,
} from './IdentityResolver';

// Resource policy
export {
  type PolicyParseResult,
  type PolicyValidationResult,
  type ResourcePolicy,
} from './ResourcePolicy';

// Paginated search
export {
  type PaginatedSearchParams,
  type PaginatedQdnSearchResult,
  type QdnSearchFn,
  paginatedQdnSearch,
} from './paginatedQdnSearch';

// Bounded fetch
export {
  type FetchedResource,
  type FetchFailure,
  type BoundedFetchResult,
  type QdnFetchFn,
  type PayloadParser,
  boundedFetchResources,
} from './fetchQdnResources';

// Validation pipeline
export {
  type PipelineResult,
  validateResource,
  validateBatch,
} from './validationPipeline';

// ---- Runtime Adapters ----

// Runtime types
export {
  type QueryCompleteness,
  type RuntimeDiagnostic,
  type ValidatedResource,
  type ValidatedRuntimeQueryResult,
  type RuntimeQueryParams,
  type CanonicalIdentity,
  type EntityViewModel,
  toRuntimeDiagnostic,
  emptyResult,
} from './runtime/runtimeTypes';

// Shared validated query runtime
export {
  validatedRuntimeQuery,
} from './runtime/validatedQueryRuntime';

// Identity resolver adapter
export {
  createBridgeNameLookup,
  getIdentityResolver,
  resetIdentityResolver,
} from './runtime/identityResolverAdapter';

// Post runtime
export {
  POST_SEARCH_PREFIX,
  type PostQueryResult,
  type ValidatedPost,
  buildPostPayload,
  queryPosts,
} from './runtime/postRuntime';

// Comment runtime
export {
  COMMENT_SEARCH_PREFIX,
  type CommentQueryResult,
  type ValidatedComment,
  buildCommentPayload,
  queryComments,
} from './runtime/commentRuntime';

// Wiki runtime
export {
  WIKI_SEARCH_PREFIX,
  type WikiQueryResult,
  type ValidatedWikiArticle,
  generateWikiEntityId,
  wikiSlug,
  buildWikiCreatePayload,
  buildWikiUpdatePayload,
  queryWikiArticles,
} from './runtime/wikiRuntime';

// Event runtime
export {
  EVENT_SEARCH_PREFIX,
  type EventQueryResult,
  type ValidatedEvent,
  generateEventEntityId,
  buildEventCreatePayload,
  buildEventUpdatePayload,
  queryEvents,
  fetchValidatedEventByEntityId,
  type EventLookupResult,
  type EventLookupStatus,
} from './runtime/eventRuntime';

// Media runtime
export {
  MEDIA_SEARCH_PREFIX,
  type MediaReferenceResolution,
  type ResolvedMediaView,
  resolveMediaReference,
  toResolvedMediaView,
} from './runtime/mediaRuntime';

// Tombstone runtime
export {
  TOMBSTONE_SEARCH_PREFIX,
  type TombstoneQueryResult,
  type ValidatedTombstone,
  type TombstoneComposition,
  buildTombstonePayload,
  queryTombstones,
  buildTombstoneComposition,
} from './runtime/tombstoneRuntime';
