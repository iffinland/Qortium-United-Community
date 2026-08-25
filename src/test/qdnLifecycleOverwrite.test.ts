// ===== H2 QDN Coordinate Overwrite Boundary Tests =====
//
// Reproduces the audit finding that lifecycle updates republish one QDN
// coordinate, so only the latest payload remains discoverable. The production
// reducers must accept the current (closed/terminal) payload on its own; they
// must not require a retained open/initial snapshot that QDN does not expose.

import { describe, expect, it } from 'vitest';
import { reducePollSnapshots } from '../services/qdn/runtime/pollSnapshotReducer';
import { reduceProjectSnapshots } from '../services/qdn/runtime/projectSnapshotReducer';
import { reducePollResults } from '../services/qdn/runtime/pollRuntime';
import { reduceProjectResults } from '../services/qdn/runtime/projectRuntime';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import type { QucpPoll } from '../services/qdn/schemas/pollSchema';
import type { QucpProject } from '../services/qdn/schemas/projectSchema';
import type { ValidatedRuntimeQueryResult } from '../services/qdn/runtime/runtimeTypes';

const WALLET = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

function pollEnvelope(
  isClosed: boolean,
  created: number,
  entityId = 'poll00001',
): QdnResourceEnvelope<QucpPoll> {
  return {
    metadata: { name: 'Alice', service: 'DOCUMENT', identifier: `qucp-poll-${entityId}`, created, updated: created },
    data: {
      schemaVersion: 1,
      resourceFamily: 'qucp-poll',
      entityId,
      question: 'Question?',
      options: [
        { optionId: 'opt-aaaa', label: 'A' },
        { optionId: 'opt-bbbb', label: 'B' },
      ],
      isClosed,
      allowVoteChange: true,
      ownerName: 'Alice',
      ownerAddress: WALLET,
      createdAt: created,
    },
    source: 'qdn',
    resolvedPublisherAddress: WALLET,
  };
}

function projectEnvelope(
  status: QucpProject['status'],
  created: number,
  entityId = 'proj00001',
): QdnResourceEnvelope<QucpProject> {
  return {
    metadata: { name: 'Alice', service: 'DOCUMENT', identifier: `qucp-project-${entityId}`, created, updated: created },
    data: {
      schemaVersion: 1,
      resourceFamily: 'qucp-project',
      entityId,
      title: 'Project',
      description: 'Description',
      status,
      ownerName: 'Alice',
      ownerAddress: WALLET,
      createdAt: created,
    },
    source: 'qdn',
    resolvedPublisherAddress: WALLET,
  };
}

describe('poll close survives QDN overwrite', () => {
  it('open poll snapshot is canonical', () => {
    const result = reducePollSnapshots('poll00001', [pollEnvelope(false, 1000)]);
    expect(result.poll).not.toBeNull();
    expect(result.poll!.isClosed).toBe(false);
    expect(result.poll!.canonicalOwnerWallet).toBe(WALLET);
  });

  it('closed poll snapshot is canonical after close overwrites the coordinate', () => {
    // QDN exposes only the closed payload after a close republishes the same
    // identifier; there is no retained open snapshot.
    const result = reducePollSnapshots('poll00001', [pollEnvelope(true, 2000)]);
    expect(result.poll).not.toBeNull();
    expect(result.poll!.isClosed).toBe(true);
    expect(result.poll!.canonicalOwnerWallet).toBe(WALLET);
    expect(result.rejectedCount).toBe(0);
  });

  it('only latest coordinate content is available and remains closed after reload', () => {
    const result = reducePollResults({
      status: 'complete',
      items: [
        {
          envelope: pollEnvelope(true, 2000),
          entityId: 'poll00001',
          publisherName: 'Alice',
          publisherAddress: WALLET,
        },
      ],
      rejectedCount: 0,
      quarantinedCount: 0,
      diagnostics: [],
    });
    expect(result.polls).toHaveLength(1);
    expect(result.polls[0].isClosed).toBe(true);
  });
});

describe('project terminal state survives QDN overwrite', () => {
  it('active project snapshot is canonical', () => {
    const result = reduceProjectSnapshots('proj00001', [projectEnvelope('active', 1000)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('active');
  });

  it('completed project is canonical after overwrite', () => {
    const result = reduceProjectSnapshots('proj00001', [projectEnvelope('completed', 2000)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('completed');
    expect(result.rejectedCount).toBe(0);
  });

  it('archived project is canonical after overwrite', () => {
    const result = reduceProjectSnapshots('proj00001', [projectEnvelope('archived', 3000)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('archived');
    expect(result.rejectedCount).toBe(0);
  });

  it('terminal project remains canonical through the list reducer', () => {
    const queryResult: ValidatedRuntimeQueryResult<QucpProject> = {
      status: 'complete',
      items: [
        {
          envelope: projectEnvelope('archived', 3000),
          entityId: 'proj00001',
          publisherName: 'Alice',
          publisherAddress: WALLET,
        },
      ],
      rejectedCount: 0,
      quarantinedCount: 0,
      diagnostics: [],
    };
    const result = reduceProjectResults(queryResult);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].status).toBe('archived');
    expect(result.completeness).toBe('complete');
  });
});
