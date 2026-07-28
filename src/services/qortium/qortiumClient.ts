// ===== Qortium qdnRequest Bridge Wrapper =====
//
// Based on patterns from Discussion-Boards and qortium-blog projects.
// Communicates with Qortium Core through the qdnRequest bridge
// injected by Qortium Home into Q-Apps.
//
// Bridge detection uses only globalThis/window/parent/top — no undeclared
// identifier evaluation that could throw ReferenceError outside Qortium Home.

const BRIDGE_WAIT_MS = 4000;
const BRIDGE_POLL_MS = 200;

const isBridgeRequestFunction = (
  value: unknown
): value is (payload: Record<string, unknown>) => Promise<unknown> =>
  typeof value === 'function';

const getRequestBridge = (): ((
  payload: Record<string, unknown>
) => Promise<unknown>) | null => {
  // Only access qdnRequest via globalThis/window — never via an undeclared identifier

  try {
    const globalBridge = (
      globalThis as typeof globalThis & { qdnRequest?: unknown }
    ).qdnRequest;
    if (typeof globalBridge !== 'undefined' && isBridgeRequestFunction(globalBridge))
      return globalBridge;
  } catch {
    /* not defined */
  }

  if (typeof window !== 'undefined') {
    const win = window as Window & {
      qdnRequest?: (payload: Record<string, unknown>) => Promise<unknown>;
      parent?: Window & { qdnRequest?: (payload: Record<string, unknown>) => Promise<unknown> };
      top?: Window & { qdnRequest?: (payload: Record<string, unknown>) => Promise<unknown> };
    };
    if (isBridgeRequestFunction(win.qdnRequest)) return win.qdnRequest;

    try {
      if (isBridgeRequestFunction(win.parent?.qdnRequest))
        return win.parent!.qdnRequest!;
    } catch {
      /* cross-origin */
    }
    try {
      if (isBridgeRequestFunction(win.top?.qdnRequest))
        return win.top!.qdnRequest!;
    } catch {
      /* cross-origin */
    }
  }

  return null;
};

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

const waitForQortiumBridge = async () => {
  const immediate = getRequestBridge();
  if (immediate) return immediate;

  const startedAt = Date.now();
  while (Date.now() - startedAt < BRIDGE_WAIT_MS) {
    await sleep(BRIDGE_POLL_MS);
    const bridge = getRequestBridge();
    if (bridge) return bridge;
  }

  return null;
};

/**
 * Check if the Qortium bridge is available in this environment.
 */
export const isQortiumBridgeAvailable = (): boolean =>
  getRequestBridge() !== null;

/**
 * Parse a QDN resource response that may be:
 *   - A plain object
 *   - A JSON string
 *   - A base64-encoded JSON string (common for FETCH_QDN_RESOURCE)
 */
export const parseQdnResponse = (raw: unknown): unknown => {
  if (!raw) return raw;
  if (typeof raw !== 'string') return raw;

  // Try direct JSON parse first
  try {
    return JSON.parse(raw);
  } catch {
    /* not plain JSON */
  }

  // Try base64 decode then JSON parse
  try {
    return JSON.parse(atob(raw));
  } catch {
    /* not base64 JSON either */
  }

  // Try double-encoded (sometimes QDN wraps twice)
  try {
    const once = atob(raw);
    const twice = JSON.parse(atob(once));
    return twice;
  } catch {
    /* not double-encoded */
  }

  return raw;
};

/**
 * Fetch a QDN resource and parse it as a typed JSON object.
 * Convenience wrapper around requestQortium + parseQdnResponse.
 */
export const fetchQdnJson = async <T>(
  service: string,
  name: string,
  identifier: string
): Promise<T> => {
  const raw = await requestQortium<unknown>({
    action: 'FETCH_QDN_RESOURCE',
    service,
    name,
    identifier,
  });

  const parsed = parseQdnResponse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `QDN resource ${service}/${name}/${identifier} returned non-object data.`
    );
  }

  return parsed as T;
};

/**
 * Extract an array from a QDN resource response.
 * QDN resources often wrap arrays: { posts: [...] }
 */
export const extractArray = <T>(
  data: Record<string, unknown>,
  key: string
): T[] => {
  const value = data[key];
  if (Array.isArray(value)) return value as T[];
  return [];
};

// Cache for the current user's QDN name
let cachedOwnerName: string | null = null;
let ownerNameCachedAt = 0;
const OWNER_NAME_TTL_MS = 5 * 60 * 1000;

/**
 * Get the current user's registered QDN name for publishing.
 * All QDN publishes must use a name owned by the publishing wallet.
 */
export const getOwnerName = async (): Promise<string> => {
  const now = Date.now();
  if (cachedOwnerName && now - ownerNameCachedAt < OWNER_NAME_TTL_MS) {
    return cachedOwnerName;
  }

  // Get account address, then look up names
  const rawAccount = await requestQortium<unknown>({
    action: 'GET_SELECTED_ACCOUNT',
  });
  const account = parseQdnResponse(rawAccount) as Record<string, unknown> | null;
  const address = account && typeof account.address === 'string' ? account.address : '';

  if (address) {
    // Try GET_ACCOUNT_NAMES
    try {
      const rawNames = await requestQortium<unknown>({
        action: 'GET_ACCOUNT_NAMES',
        address,
      });
      const parsed = parseQdnResponse(rawNames);
      console.log('[getOwnerName] GET_ACCOUNT_NAMES raw:', typeof rawNames, 'parsed:', typeof parsed, Array.isArray(parsed) ? parsed.length : 'not array');

      const names: string[] = [];
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === 'string' && entry.trim()) {
            names.push(entry.trim());
          } else if (entry && typeof entry === 'object') {
            const n = (entry as Record<string, unknown>).name;
            if (typeof n === 'string' && n.trim()) names.push(n.trim());
          }
        }
      }

      if (names.length > 0) {
        cachedOwnerName = names[0];
        ownerNameCachedAt = now;
        console.log('[getOwnerName] Resolved:', cachedOwnerName);
        return cachedOwnerName;
      }
    } catch (err) {
      console.warn('[getOwnerName] GET_ACCOUNT_NAMES failed:', err);
      // GET_ACCOUNT_NAMES failed, try account.name fallback
    }
  }

  // Fallback: account object itself might have a name
  if (account && typeof account.name === 'string' && account.name.trim()) {
    cachedOwnerName = account.name.trim();
    ownerNameCachedAt = now;
    return cachedOwnerName;
  }

  throw new Error(
    'No registered QDN name found. Register a name in Qortium Home to publish content.'
  );
};

/**
 * Send a request through the Qortium qdnRequest bridge.
 * Simplified pattern from qortium-blog: call bridge directly.
 */
export const requestQortium = async <TResponse = unknown>(
  payload: Record<string, unknown>
): Promise<TResponse> => {
  const action = typeof payload.action === 'string' ? payload.action : 'UNKNOWN';
  const bridge = await waitForQortiumBridge();

  if (!bridge) {
    throw new Error(
      'QDN request bridge is not available. Open this app inside Qortium Home.'
    );
  }

  console.log(`[requestQortium] Calling ${action}...`);
  const response = await bridge(payload);
  console.log(`[requestQortium] ${action} done, response type:`, typeof response);
  return response as TResponse;
};
