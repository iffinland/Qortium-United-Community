// ===== Qortium Home Text-Size Adapter =====
//
// Qortium Home owns display settings. QUC only consumes the text-size part of
// that contract and maps it onto a root `data-text-size` attribute. Existing
// rem-based Tailwind typography then scales naturally, so no per-component
// font-size plumbing is needed.
//
// This file is intentionally small. It does NOT implement appZoom or any local
// zoom/transform/root-scale layer. Home remains the sole zoom authority.

import { requestQortium } from './qortiumClient';

export const HOME_TEXT_SIZES = [
  'extra-small',
  'small',
  'medium',
  'large',
  'extra-large',
  'huge',
] as const;

export type HomeTextSize = (typeof HOME_TEXT_SIZES)[number];
export type HomeTextSizeSource =
  | 'default'
  | 'home-url'
  | 'home-bridge'
  | 'home-event';

export type HomeTextSizeState = {
  value: HomeTextSize;
  source: HomeTextSizeSource;
};

export type HomeTextSizeRequest = (
  payload: Record<string, unknown>,
) => Promise<unknown> | unknown;

export type HomeTextSizeTarget = {
  dataset: DOMStringMap;
};

export const DEFAULT_HOME_TEXT_SIZE: HomeTextSize = 'medium';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const includes = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => typeof value === 'string' && values.includes(value as T);

/**
 * Normalize a raw Home text-size value. Missing or malformed values fall back
 * to medium, which keeps the root at the app's existing 16px baseline.
 */
export const normalizeHomeTextSize = (
  value: unknown,
  fallback: HomeTextSize = DEFAULT_HOME_TEXT_SIZE,
): HomeTextSize => includes(HOME_TEXT_SIZES, value) ? value : fallback;

/**
 * Home uses `textSize` in its settings contract, while some older payloads may
 * still expose `textScale`. Both resolve to the same application value.
 */
export const getHomeTextSizeCandidate = (
  value: unknown,
): { found: boolean; value: unknown } => {
  if (!isRecord(value)) return { found: false, value: undefined };

  if (Object.prototype.hasOwnProperty.call(value, 'textSize')) {
    return { found: true, value: value.textSize };
  }

  if (Object.prototype.hasOwnProperty.call(value, 'textScale')) {
    return { found: true, value: value.textScale };
  }

  return { found: false, value: undefined };
};

/**
 * Read the effective Home text size from a Q-App query string. Home supplies
 * this parameter at resource load, so it is the correct first paint source.
 */
export const readHomeTextSizeFromUrl = (search: string): HomeTextSizeState => {
  const params = new URLSearchParams(search);
  const value = params.get('textSize') ?? undefined;
  return {
    value: normalizeHomeTextSize(value),
    source: 'home-url',
  };
};

export const applyHomeTextSize = (
  textSize: HomeTextSize,
  target: HomeTextSizeTarget = document.documentElement,
): void => {
  target.dataset.textSize = textSize;
};

/**
 * Normalize a direct Home settings payload (GET_HOME_SETTINGS response or the
 * detail of a `qortiumHomeSettingsChanged` CustomEvent).
 */
export const normalizeHomeTextSizePayload = (
  payload: unknown,
  source: HomeTextSizeSource = 'home-bridge',
): HomeTextSizeState | null => {
  const candidate = getHomeTextSizeCandidate(payload);
  if (!candidate.found) return null;
  return {
    value: normalizeHomeTextSize(candidate.value),
    source,
  };
};

/**
 * Parse one message event from Home.
 *
 * The supported shapes are:
 *   - `{ type: 'qortium:home-settings-changed', detail: { textSize: ... } }`
 *   - `{ action: 'TEXT_SIZE_CHANGED', textSize: ... }`
 */
export const getHomeTextSizeUpdate = (
  data: unknown,
  current: HomeTextSizeState,
): HomeTextSizeState | null => {
  if (!isRecord(data)) return null;

  if (data.type === 'qortium:home-settings-changed') {
    const payload = isRecord(data.detail) ? data.detail : data;
    const next = normalizeHomeTextSizePayload(payload, 'home-event');
    return next ?? current;
  }

  if (data.action === 'TEXT_SIZE_CHANGED') {
    const next = normalizeHomeTextSizePayload(data, 'home-event');
    return next ?? current;
  }

  return null;
};

/**
 * A live event is newer than a bridge read. Never let a slow initial
 * GET_HOME_SETTINGS response replace a text size the user changed in the
 * meantime.
 */
export const preferLiveHomeTextSize = (
  current: HomeTextSizeState,
  loaded: HomeTextSizeState,
): HomeTextSizeState => (current.source === 'home-event' ? current : loaded);

export const isTrustedHomeTextSizeEvent = (
  eventSource: MessageEventSource | null,
  currentWindow: Window,
): boolean =>
  eventSource === currentWindow.parent ||
  eventSource === currentWindow.top ||
  eventSource === currentWindow;

export type HomeTextSizeSyncOptions = {
  initial?: HomeTextSizeState;
  request?: HomeTextSizeRequest;
  target?: HomeTextSizeTarget;
};

/**
 * Start central Home text-size synchronization.
 *
 * The returned function removes all listeners and prevents an in-flight bridge
 * read from mutating state after unmount/cleanup.
 */
export const startHomeTextSizeSync = (
  options: HomeTextSizeSyncOptions = {},
): (() => void) => {
  const target = options.target ?? document.documentElement;
  const request = options.request ?? ((payload) => requestQortium(payload));
  const initial =
    options.initial ?? { value: DEFAULT_HOME_TEXT_SIZE, source: 'default' };

  let active = true;
  let current = initial;
  let bridgeRevision = 0;
  let liveRevision = 0;

  const update = (next: HomeTextSizeState): void => {
    current = next;
    applyHomeTextSize(current.value, target);
  };

  update(current);

  const handleMessage = (event: MessageEvent): void => {
    if (!isTrustedHomeTextSizeEvent(event.source, window)) return;

    const next = getHomeTextSizeUpdate(event.data, current);
    if (!next || next.source !== 'home-event') return;

    liveRevision += 1;
    update(next);
  };

  const handleHomeSettingsChanged = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    const next = normalizeHomeTextSizePayload(detail, 'home-event');
    if (!next) return;

    liveRevision += 1;
    update(next);
  };

  window.addEventListener('message', handleMessage);
  window.addEventListener(
    'qortiumHomeSettingsChanged',
    handleHomeSettingsChanged,
  );

  const revision = bridgeRevision + 1;
  bridgeRevision = revision;
  const liveAtStart = liveRevision;

  void Promise.resolve(request({ action: 'GET_HOME_SETTINGS' }))
    .then((response) => {
      if (!active || bridgeRevision !== revision) return;

      const loaded = normalizeHomeTextSizePayload(response, 'home-bridge');
      if (!loaded) return;

      // A live Home event received while this read was in flight is newer.
      if (liveRevision !== liveAtStart) return;

      update(preferLiveHomeTextSize(current, loaded));
    })
    .catch(() => {
      // The Home bridge is optional at startup. Cosmetic settings failures
      // must never block QUC from rendering.
    });

  return () => {
    active = false;
    window.removeEventListener('message', handleMessage);
    window.removeEventListener(
      'qortiumHomeSettingsChanged',
      handleHomeSettingsChanged,
    );
  };
};
