// ===== QDN Schemas — Public API =====

export {
  SCHEMA_VERSION,
  schemaVersionField,
  entityIdField,
  qdnNameField,
  walletAddressField,
  timestampField,
  editedAtField,
  titleField,
  contentField,
  summaryField,
  tagsField,
  tagField,
  slugField,
  categoryIdField,
  entityStatusField,
  ownerNameField,
  ownerAddressField,
  resourceFamilyField,
  authoritativeEntityBase,
  CONTENT_LIMITS,
  type QucpResourceFamily,
  type AuthoritativeEntityBase,
} from './commonSchemas';

export {
  postSchema,
  POST_IMMUTABLE_FIELDS,
  type QucpPost,
} from './postSchema';

export {
  wikiArticleSchema,
  WIKI_IMMUTABLE_FIELDS,
  type QucpWikiArticle,
} from './wikiArticleSchema';

export {
  forumTopicSchema,
  FORUM_TOPIC_IMMUTABLE_FIELDS,
  type QucpForumTopic,
} from './forumTopicSchema';

export {
  supportTicketSchema,
  TICKET_IMMUTABLE_FIELDS,
  type QucpSupportTicket,
} from './supportTicketSchema';

export {
  postCommentSchema,
  POST_COMMENT_IMMUTABLE_FIELDS,
  type QucpPostComment,
} from './postCommentSchema';

export {
  forumReplySchema,
  FORUM_REPLY_IMMUTABLE_FIELDS,
  type QucpForumReply,
} from './forumReplySchema';

export {
  ticketReplySchema,
  TICKET_REPLY_IMMUTABLE_FIELDS,
  type QucpTicketReply,
} from './ticketReplySchema';

export {
  reactionSchema,
  type QucpReaction,
} from './reactionSchema';

export {
  ownerTombstoneSchema,
  type QucpOwnerTombstone,
} from './ownerTombstoneSchema';

export {
  roleRegistrySnapshotSchema,
  SNAPSHOT_SCHEMA_VERSION,
  ROLE_VALUES,
  type QucpRole,
  type QucpRoleRegistrySnapshot,
} from './roleRegistrySnapshotSchema';

export {
  moderationOperationSchema,
  MODERATION_SCHEMA_VERSION,
  MODERATION_ACTIONS,
  MODERATION_TARGET_FAMILIES,
  ACTION_TARGET_MATRIX,
  INVERSE_ACTIONS,
  type ModerationAction,
  type ModerationTargetFamily,
  type QucpModerationOperation,
} from './moderationOperationSchema';

export {
  pollReferenceSchema,
  POLL_REFERENCE_SCHEMA_VERSION,
  POLL_PARENT_FAMILIES,
  type PollParentFamily,
  type QucpPollReference,
} from './pollReferenceSchema';

export {
  mediaReferenceSchema,
  MEDIA_REFERENCE_SCHEMA_VERSION,
  MEDIA_PARENT_FAMILIES,
  MEDIA_ROLES,
  SUPPORTED_MEDIA_SERVICES,
  MEDIA_ROLE_PARENT_MATRIX,
  MEDIA_ROLE_SERVICE_MATRIX,
  type MediaParentFamily,
  type MediaRole,
  type SupportedMediaService,
  type QucpMediaReference,
} from './mediaReferenceSchema';
