// ===== Qortium-Native QDN Navigation =====
//
// Opens qdn:// addresses using Qortium Home's established bridge actions.
// APP, WEBSITE, and GAME resources must navigate as an app/browser tab;
// other public resources open in Home's tab-scoped resource viewer.

import { requestQortium } from './qortiumClient';

const TAB_SERVICES = new Set(['APP', 'WEBSITE', 'GAME']);

const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export interface QdnUrlParts {
  service: string;
  name: string;
  identifier?: string;
  path?: string;
}

export function parseQdnUrl(rawUrl: string): QdnUrlParts | null {
  const trimmed = rawUrl.trim();
  if (!/^qdn:\/\//i.test(trimmed)) return null;

  const rest = trimmed.slice('qdn://'.length);
  if (!rest) return null;

  const hashIndex = rest.indexOf('#');
  const withoutHash = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  const queryIndex = withoutHash.indexOf('?');
  const withoutQuery = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const parts = withoutQuery.split('/').filter(Boolean);

  if (parts.length < 2) return null;

  const service = parts[0].toUpperCase();
  const name = decodeSegment(parts[1]);
  const identifier = parts[2] ? decodeSegment(parts[2]) : undefined;
  const path = parts.slice(3).map(decodeSegment).join('/') || undefined;

  if (!service || !name) return null;

  return {
    service,
    name,
    identifier,
    path,
  };
}

export async function openQdnUrl(rawUrl: string): Promise<boolean> {
  const parsed = parseQdnUrl(rawUrl);
  if (!parsed) {
    throw new Error('Enter a valid qdn:// address.');
  }

  if (TAB_SERVICES.has(parsed.service)) {
    return Boolean(
      await requestQortium<unknown>({
        action: 'OPEN_NEW_TAB',
        address: rawUrl.trim(),
      }),
    );
  }

  return Boolean(
    await requestQortium<unknown>({
      action: 'OPEN_QDN_RESOURCE_VIEWER',
      service: parsed.service,
      name: parsed.name,
      identifier: parsed.identifier,
      path: parsed.path,
    }),
  );
}
