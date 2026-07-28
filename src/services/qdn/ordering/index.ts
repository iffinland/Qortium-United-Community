// ===== Ordering — Public API =====

export {
  compareByQdnMetadata,
  selectLatestVersion,
  classifyEntity,
  validateImmutableFields,
  type EntityClassification,
  type ImmutableFieldResult,
} from './authoritativeEntityOrdering';

export {
  classifyOrphan,
  validateParentReference,
  validateReplyChain,
  MAX_REPLY_DEPTH,
  type OrphanStatus,
  type OrphanClassification,
  type ReplyChainStatus,
  type ReplyChainResult,
} from './parentReference';
