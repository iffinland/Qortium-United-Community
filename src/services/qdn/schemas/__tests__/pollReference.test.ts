// ===== Poll Reference & Native Poll Architecture Tests =====
//
// QUCP-REF-006: Poll reference schema, identifiers, policies,
// parent authorization, native poll normalizers, status, linkage, and inputs.

import { describe, it, expect } from 'vitest';
import { pollReferenceSchema, type QucpPollReference } from '../pollReferenceSchema';
import {
  buildPollReferenceIdentifier, parsePollReferenceIdentifier,
  validatePollReferenceIdentifier, POLL_REFERENCE_PREFIX,
  buildPollReferenceSearchPrefix,
} from '../../identifiers/pollReferenceIdentifiers';
import {
  authorizePollReferenceForParent, type CanonicalParentInfo,
} from '../../polls/pollReferenceAuthorization';
import {
  normalizeNativePollDefinition, normalizeNativePollResults,
  normalizeCreatePollResponse, normalizeVoteResponse,
} from '../../polls/nativePollNormalizers';
import { derivePollStatus, isPollOpen } from '../../polls/pollStatus';
import { validatePollLinkage } from '../../polls/pollLinkage';
import {
  validateCreatePollInput, validateVoteInput,
} from '../../polls/pollInputValidation';

// ---- Test Wallets ----
const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

// ---- Helper ----
function validRef(overrides?: Partial<QucpPollReference>): QucpPollReference {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-poll-reference' as const,
    entityId: 'pr-00001',
    parentFamily: 'qucp-post',
    parentEntityId: 'post1234567890',
    pollId: '42',
    pollName: 'community-poll-2026',
    ownerName: 'Alice',
    ownerAddress: OWNER,
    createdAt: 1700000000000,
    ...overrides,
  };
}

// ================================================================
//  POLL REFERENCE SCHEMA
// ================================================================

describe('poll reference schema', () => {
  it('valid strict reference accepted', () => {
    expect(pollReferenceSchema.safeParse(validRef()).success).toBe(true);
  });

  it('exact schema version', () => {
    expect(pollReferenceSchema.safeParse({ ...validRef(), schemaVersion: 2 }).success).toBe(false);
  });

  it('valid parent family', () => {
    expect(pollReferenceSchema.safeParse(validRef({ parentFamily: 'qucp-post' })).success).toBe(true);
  });

  it('invalid parent family rejected', () => {
    expect(pollReferenceSchema.safeParse({ ...validRef(), parentFamily: 'qucp-reaction' }).success).toBe(false);
  });

  it('valid poll ID', () => {
    expect(pollReferenceSchema.safeParse(validRef({ pollId: '123' })).success).toBe(true);
  });

  it('poll ID rejects zero', () => {
    expect(pollReferenceSchema.safeParse({ ...validRef(), pollId: '0' }).success).toBe(false);
  });

  it('missing owner rejected', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ownerName, ...rest } = validRef();
    expect(pollReferenceSchema.safeParse(rest).success).toBe(false);
  });

  it('unknown field rejected', () => {
    expect(pollReferenceSchema.safeParse({ ...validRef(), votes: [] }).success).toBe(false);
  });

  it('embedded vote array rejected', () => {
    expect(pollReferenceSchema.safeParse({ ...validRef(), voteCounts: [1, 2, 3] }).success).toBe(false);
  });

  it('embedded result count rejected', () => {
    expect(pollReferenceSchema.safeParse({ ...validRef(), totalVotes: 100 }).success).toBe(false);
  });
});

// ================================================================
//  POLL REFERENCE IDENTIFIERS
// ================================================================

describe('poll reference identifiers', () => {
  it('builds identifier', () => {
    expect(buildPollReferenceIdentifier('pr-abcdef')).toBe('qucp-pr-pr-abcdef');
  });

  it('parses identifier', () => {
    const parsed = parsePollReferenceIdentifier('qucp-pr-pr-abcdef');
    expect(parsed).not.toBeNull();
    expect(parsed!.entityId).toBe('pr-abcdef');
  });

  it('validates correct identifier', () => {
    expect(validatePollReferenceIdentifier('qucp-pr-pr-abcdef')).toBe(true);
  });

  it('rejects wrong prefix', () => {
    expect(validatePollReferenceIdentifier('qucp-post-abc')).toBe(false);
  });

  it('rejects malformed ID', () => {
    expect(parsePollReferenceIdentifier('qucp-pr-')).toBeNull();
  });

  it('search prefix correct', () => {
    expect(buildPollReferenceSearchPrefix()).toBe(POLL_REFERENCE_PREFIX);
  });

  it('entity ID round-trip', () => {
    const id = buildPollReferenceIdentifier('pr-xyz789');
    const parsed = parsePollReferenceIdentifier(id);
    expect(parsed!.entityId).toBe('pr-xyz789');
  });
});

// ================================================================
//  PARENT AUTHORIZATION
// ================================================================

describe('parent authorization', () => {
  function parent(overrides?: Partial<CanonicalParentInfo>): CanonicalParentInfo {
    return {
      entityId: 'post1234567890', resourceFamily: 'qucp-post',
      ownerName: 'Alice', ownerAddress: OWNER, status: 'accepted',
      ...overrides,
    };
  }

  it('matching parent owner authorized', () => {
    const result = authorizePollReferenceForParent(validRef(), parent());
    expect(result.status).toBe('authorized');
  });

  it('foreign reference publisher rejected', () => {
    const result = authorizePollReferenceForParent(
      validRef({ ownerAddress: FOREIGN }),
      parent(),
    );
    expect(result.status).toBe('owner-mismatch');
  });

  it('wrong parent family rejected', () => {
    const result = authorizePollReferenceForParent(
      validRef({ parentFamily: 'qucp-wiki' }),
      parent(),
    );
    expect(result.status).toBe('parent-family-mismatch');
  });

  it('wrong parent entity ID rejected', () => {
    const result = authorizePollReferenceForParent(
      validRef({ parentEntityId: 'other-post' }),
      parent(),
    );
    expect(result.status).toBe('parent-entity-mismatch');
  });

  it('parent missing', () => {
    const result = authorizePollReferenceForParent(validRef(), null);
    expect(result.status).toBe('parent-missing');
  });

  it('parent unavailable', () => {
    const result = authorizePollReferenceForParent(validRef(), parent({ status: 'unavailable' }));
    expect(result.status).toBe('parent-unavailable');
  });

  it('parent rejected', () => {
    const result = authorizePollReferenceForParent(validRef(), parent({ status: 'rejected' }));
    expect(result.status).toBe('parent-rejected');
  });
});

// ================================================================
//  NATIVE POLL NORMALIZERS
// ================================================================

describe('native poll normalizers', () => {
  it('valid poll definition normalized', () => {
    const raw = {
      pollId: 42, pollName: 'test-poll', description: 'A test',
      pollOptions: [{ optionName: 'Yes' }, { optionName: 'No' }],
      creatorPublicKey: 'abc123', owner: OWNER, published: 1700000000000,
    };
    const result = normalizeNativePollDefinition(raw);
    expect(result.status).toBe('available');
    expect(result.poll!.pollId).toBe('42');
    expect(result.poll!.options).toHaveLength(2);
  });

  it('string options normalized', () => {
    const raw = {
      pollId: 1, pollName: 'test-poll', pollOptions: ['Option-A', 'Option-B'],
    };
    const result = normalizeNativePollDefinition(raw);
    expect(result.status).toBe('available');
  });

  it('malformed response rejected', () => {
    expect(normalizeNativePollDefinition(null).status).toBe('invalid-response');
    expect(normalizeNativePollDefinition('string').status).toBe('invalid-response');
  });

  it('missing pollId rejected', () => {
    expect(normalizeNativePollDefinition({ pollName: 'test-poll-name' }).status).toBe('invalid-response');
  });

  it('duplicate options filtered', () => {
    const raw = {
      pollId: 1, pollName: 'test-poll',
      pollOptions: [{ optionName: 'A' }, { optionName: 'A' }, { optionName: 'B' }],
    };
    const result = normalizeNativePollDefinition(raw);
    expect(result.status).toBe('available');
    expect(result.poll!.options).toHaveLength(2);
  });

  it('too few options rejected', () => {
    const raw = {
      pollId: 1, pollName: 'test-poll-name',
      pollOptions: [{ optionName: 'Only' }],
    };
    expect(normalizeNativePollDefinition(raw).status).toBe('invalid-response');
  });

  it('valid raw results normalized', () => {
    const raw = {
      pollId: 42,
      options: [
        { optionName: 'Yes', rawVotes: 10, weightedVotes: 15 },
        { optionName: 'No', rawVotes: 5 },
      ],
      complete: true,
    };
    const result = normalizeNativePollResults(raw);
    expect(result.status).toBe('complete');
    expect(result.results!.options).toHaveLength(2);
    expect(result.results!.totalRawVotes).toBe(15);
    expect(result.results!.options[0].weightedVotes).toBe(15);
    expect(result.results!.options[1].weightedVotes).toBeUndefined();
  });

  it('negative votes rejected', () => {
    const raw = {
      pollId: 1,
      options: [{ rawVotes: -1 }],
    };
    expect(normalizeNativePollResults(raw).status).toBe('invalid');
  });

  it('partial results marked as partial', () => {
    const raw = {
      pollId: 1,
      options: [{ rawVotes: 5 }, { rawVotes: 3 }],
      complete: false,
    };
    expect(normalizeNativePollResults(raw).status).toBe('partial');
  });

  it('create response normalized', () => {
    const result = normalizeCreatePollResponse({ accepted: true, pollName: 'p', transactionSignature: 'sig123' });
    expect(result.status).toBe('confirmed');
    expect(result.transactionSignature).toBe('sig123');
  });

  it('user rejection distinguished', () => {
    const result = normalizeCreatePollResponse({ accepted: false, reason: 'Denied' });
    expect(result.status).toBe('user-rejected');
  });

  it('vote response normalized', () => {
    const result = normalizeVoteResponse({ accepted: true, transactionSignature: 'vote-sig' });
    expect(result.status).toBe('confirmed');
  });
});

// ================================================================
//  POLL STATUS
// ================================================================

describe('poll status', () => {
  const base = { pollId: '1', pollName: 'p', options: [], published: 100 } as NativePollDefinition;

  it('scheduled when start is future', () => {
    expect(derivePollStatus({ ...base, startTime: 200 }, 100)).toBe('scheduled');
  });

  it('open when no end time', () => {
    expect(derivePollStatus(base, 200)).toBe('open');
  });

  it('open when end is future', () => {
    expect(derivePollStatus({ ...base, endTime: 300 }, 200)).toBe('open');
  });

  it('expired when end passed', () => {
    expect(derivePollStatus({ ...base, endTime: 150 }, 200)).toBe('expired');
  });

  it('isPollOpen true for open poll', () => {
    expect(isPollOpen(base, 200)).toBe(true);
  });
});

// ---- Helper for linkage tests ----
function makePoll(overrides?: Partial<NativePollDefinition>): NativePollDefinition {
  return {
    pollId: '42', pollName: 'community-poll-2026',
    options: [{ optionName: 'Yes', optionIndex: 0 }, { optionName: 'No', optionIndex: 1 }],
    published: 1700000000000,
    ...overrides,
  };
}

// ================================================================
//  POLL LINKAGE
// ================================================================

describe('poll linkage', () => {
  it('full linkage succeeds', () => {
    const poll = makePoll({ owner: OWNER });
    const result = validatePollLinkage(validRef(), 'authorized', poll, true);
    expect(result.status).toBe('linked');
  });

  it('poll not found', () => {
    const result = validatePollLinkage(validRef(), 'authorized', null, true);
    expect(result.status).toBe('poll-not-found');
  });

  it('poll unavailable', () => {
    const result = validatePollLinkage(validRef(), 'authorized', null, false);
    expect(result.status).toBe('poll-unavailable');
  });

  it('creator mismatch rejected', () => {
    const poll = makePoll({ owner: FOREIGN });
    const result = validatePollLinkage(validRef(), 'authorized', poll, true);
    expect(result.status).toBe('poll-creator-mismatch');
  });

  it('parent unauthorized', () => {
    const result = validatePollLinkage(validRef(), 'owner-mismatch', null, true);
    expect(result.status).toBe('parent-unauthorized');
  });

  it('creator unverified when metadata missing', () => {
    const poll = makePoll(); // no owner or creatorPublicKey
    const result = validatePollLinkage(validRef(), 'authorized', poll, true);
    expect(result.status).toBe('poll-creator-unverified');
  });
});

// ================================================================
//  POLL INPUT VALIDATION
// ================================================================

describe('poll input validation', () => {
  it('valid create input', () => {
    const result = validateCreatePollInput({ pollName: 'Test', options: ['A', 'B'] });
    expect(result.valid).toBe(true);
  });

  it('minimum options enforced', () => {
    expect(validateCreatePollInput({ pollName: 'T', options: ['A'] }).valid).toBe(false);
  });

  it('duplicate options rejected', () => {
    expect(validateCreatePollInput({ pollName: 'T', options: ['A', 'a'] }).valid).toBe(false);
  });

  it('empty option rejected', () => {
    expect(validateCreatePollInput({ pollName: 'T', options: ['A', '  '] }).valid).toBe(false);
  });

  it('end before start rejected', () => {
    expect(validateCreatePollInput({
      pollName: 'T', options: ['A', 'B'], startTime: 200, endTime: 100,
    }).valid).toBe(false);
  });

  it('valid vote input', () => {
    expect(validateVoteInput({ pollId: '42', optionIndexes: [1] }).valid).toBe(true);
  });

  it('vote requires at least one option', () => {
    expect(validateVoteInput({ pollId: '42', optionIndexes: [] }).valid).toBe(false);
  });

  it('vote rejects index 0 (vote removal not supported via input)', () => {
    expect(validateVoteInput({ pollId: '42', optionIndexes: [0] }).valid).toBe(false);
  });

  it('vote rejects duplicate indexes', () => {
    expect(validateVoteInput({ pollId: '42', optionIndexes: [1, 1] }).valid).toBe(false);
  });
});

// ---- Type import for linkage test ----
import type { NativePollDefinition } from '../../polls/nativePollTypes';
