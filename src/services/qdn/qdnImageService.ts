// ===== QDN Image Publication + URL Resolution =====
//
// Publishes a computer-selected image through the current Qortium Home
// single-resource contract, then provides the read path used by image
// rendering. This is the proven Qortium Blogs image model adapted to QUC:
// the parent content is published separately and only when the user submits.

import type { QdnImageRef } from '../../types';
import { requestQortium } from '../qortium/qortiumClient';
import { waitForResourceReady } from '../qortium/qdnService';

export const QDN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sanitizeFilename = (value: string) => {
  const normalized = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || '<>:"/\\|?*'.includes(character) ? '_' : character;
    })
    .join('')
    .trim()
    .slice(0, 180);
  return normalized || 'image';
};

const fileToBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const createImageIdentifier = (): string => {
  const random = Math.random().toString(36).slice(2, 8);
  return `img-${Date.now()}-${random}`;
};

/**
 * Publish a computer-selected image as a standalone QDN IMAGE resource.
 * Returns the canonical reference for embedding in rich content.
 *
 * This intentionally publishes ONLY the image asset; it never publishes or
 * updates the parent post/project/content.
 */
export const publishQdnImage = async (
  file: File,
  ownerName: string,
): Promise<QdnImageRef> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('The selected file is not a supported image.');
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new Error('Image type is not supported. Use JPEG, PNG, WebP, or GIF.');
  }
  if (file.size > QDN_IMAGE_MAX_BYTES) {
    throw new Error(`Image exceeds the ${formatBytes(QDN_IMAGE_MAX_BYTES)} Qortium Home limit.`);
  }
  if (!ownerName.trim()) {
    throw new Error('A registered QDN name is required to publish an image.');
  }

  const identifier = createImageIdentifier();
  const filename = sanitizeFilename(file.name);

  const data64 = await fileToBase64(file);

  await requestQortium<unknown>({
    action: 'PUBLISH_QDN_RESOURCE',
    service: 'IMAGE',
    name: ownerName,
    identifier,
    filename,
    data64,
  });

  const status = await waitForResourceReady('IMAGE', ownerName, identifier);
  if (status.status !== 'READY') {
    throw new Error('Image publication could not be verified as ready on QDN.');
  }

  return {
    service: 'IMAGE',
    name: ownerName,
    identifier,
    filename,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
  };
};

export type QdnResourceStatus = {
  status?: string;
  description?: string;
  localChunkCount?: number;
  totalChunkCount?: number;
  percentLoaded?: number;
};

export const normalizeStatus = (value: unknown): QdnResourceStatus => {
  if (typeof value === 'string') return { status: value.toUpperCase(), description: value };
  if (!isRecord(value)) return { status: 'UNKNOWN' };
  return {
    status: typeof value.status === 'string' ? value.status.toUpperCase() : 'UNKNOWN',
    description: typeof value.description === 'string' ? value.description : undefined,
    localChunkCount: typeof value.localChunkCount === 'number' ? value.localChunkCount : undefined,
    totalChunkCount: typeof value.totalChunkCount === 'number' ? value.totalChunkCount : undefined,
    percentLoaded: typeof value.percentLoaded === 'number' ? value.percentLoaded : undefined,
  };
};

export const getResourceStatus = async (
  service: string,
  name: string,
  identifier: string,
): Promise<QdnResourceStatus> => {
  const status = await requestQortium<unknown>({
    action: 'GET_QDN_RESOURCE_STATUS',
    service,
    name,
    identifier,
  });
  return normalizeStatus(status);
};

export const getQdnResourceUrl = async (ref: QdnImageRef): Promise<string> => {
  const value = await requestQortium<unknown>({
    action: 'GET_QDN_RESOURCE_URL',
    service: ref.service,
    name: ref.name,
    identifier: ref.identifier,
    filename: ref.filename,
  });
  return typeof value === 'string' ? value : '';
};
