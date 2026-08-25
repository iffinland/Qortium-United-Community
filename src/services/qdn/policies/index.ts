// ===== Policies — Public API =====

// Helpers
export {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateEntityIdMatch,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';

// Concrete policies — core entities
export { postPolicy } from './postPolicy';
export { wikiArticlePolicy } from './wikiArticlePolicy';
export { forumTopicPolicy } from './forumTopicPolicy';
export { supportTicketPolicy } from './supportTicketPolicy';
export { supportTicketStatusPolicy } from './supportTicketStatusPolicy';
export { eventPolicy } from './eventPolicy';

// Concrete policies — child entities
export { postCommentPolicy } from './postCommentPolicy';
export { forumReplyPolicy } from './forumReplyPolicy';
export { ticketReplyPolicy } from './ticketReplyPolicy';

// Concrete policies — actor/owner operations
export { reactionPolicy } from './reactionPolicy';
export { ownerTombstonePolicy } from './ownerTombstonePolicy';

// Concrete policies — role and moderation
export { roleSnapshotPolicy } from './roleSnapshotPolicy';
export { moderationPolicy } from './moderationPolicy';

// Concrete policies — polls
export { pollReferencePolicy } from './pollReferencePolicy';

// Concrete policies — media
export { mediaReferencePolicy } from './mediaReferencePolicy';
