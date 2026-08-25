// ===== Test QDN Bridge Helper =====
//
// Installs a controllable qdnRequest bridge for production-path tests.
// The project bridge wrapper reads from globalThis/window, so this is the
// closest deterministic substitute for Qortium Home's injected bridge.

import { QUC_SYSOP_ADDRESS } from '../../config/qortiumTrust';

export interface QdnBridgeCall {
  action: string;
  payload: Record<string, unknown>;
}

export interface PublishedResource {
  service: string;
  name: string;
  identifier: string;
  payload: Record<string, unknown>;
  filename?: string;
  title?: string;
}

export interface MockQdnBridge {
  calls: QdnBridgeCall[];
  published: PublishedResource[];
  /** Override fetch behavior for arbitrary service/name/identifier. */
  setFetch: (key: string, value: unknown) => void;
  cleanup: () => void;
}

export function installMockQdnBridge(options?: {
  selectedAccount?: string;
  ownerName?: string;
  searchResults?: (payload: Record<string, unknown>) => unknown[];
  fetch?: (payload: Record<string, unknown>) => unknown;
  nameData?: (name: string) => { owner: string; ownerAddress?: string } | null;
}): MockQdnBridge {
  const calls: QdnBridgeCall[] = [];
  const published: PublishedResource[] = [];
  const fetchOverrides = new Map<string, unknown>();
  const selectedAccount = options?.selectedAccount ?? QUC_SYSOP_ADDRESS;
  const ownerName = options?.ownerName ?? 'iffi_vaba_mees';

  const handler = async (payload: Record<string, unknown>): Promise<unknown> => {
    calls.push({ action: payload.action as string, payload });
    const action = payload.action;

    switch (action) {
      case 'GET_SELECTED_ACCOUNT':
        return { address: selectedAccount, name: ownerName };
      case 'GET_ACCOUNT_NAMES':
        return [ownerName];
      case 'GET_NAME_DATA':
        if (options?.nameData) {
          const name = payload.name as string;
          const resolved = options.nameData(name);
          return resolved ?? { owner: selectedAccount, ownerAddress: selectedAccount };
        }
        return { owner: selectedAccount, ownerAddress: selectedAccount };
      case 'SEARCH_QDN_RESOURCES':
        if (options?.searchResults) return options.searchResults(payload);
        return [];
      case 'PUBLISH_QDN_RESOURCE': {
        const data64 = payload.data64 as string;
        const service = payload.service as string;
        const name = payload.name as string;
        const identifier = payload.identifier as string;
        const parsed: Record<string, unknown> = service === 'DOCUMENT' && data64
          ? JSON.parse(atob(data64)) as Record<string, unknown>
          : {
              __binary: true,
              data64: data64 ?? '',
              service,
              name,
              identifier,
            };
        published.push({
          service,
          name,
          identifier,
          payload: parsed,
          filename: payload.filename as string | undefined,
          title: payload.title as string | undefined,
        });
        fetchOverrides.set(`${service}/${name}/${identifier}`, parsed);
        return { success: true };
      }
      case 'FETCH_QDN_RESOURCE': {
        const key = `${payload.service}/${payload.name}/${payload.identifier}`;
        if (fetchOverrides.has(key)) return fetchOverrides.get(key);
        if (options?.fetch) return options.fetch(payload);
        return null;
      }
      case 'GET_QDN_RESOURCE_STATUS':
        return { status: 'READY' };
      case 'GET_QDN_RESOURCE_URL':
        return `http://localhost:12391/render/${payload.service}/${payload.name}/${payload.identifier}`;
      default:
        return undefined;
    }
  };

  const anyGlobal = globalThis as typeof globalThis & { qdnRequest?: unknown };
  const anyWindow = window as Window & { qdnRequest?: unknown };
  anyGlobal.qdnRequest = handler;
  anyWindow.qdnRequest = handler;

  return {
    calls,
    published,
    setFetch: (key, value) => fetchOverrides.set(key, value),
    cleanup: () => {
      delete anyGlobal.qdnRequest;
      delete anyWindow.qdnRequest;
    },
  };
}
