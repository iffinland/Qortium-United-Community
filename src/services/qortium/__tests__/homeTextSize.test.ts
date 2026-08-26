import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOME_TEXT_SIZE,
  HOME_TEXT_SIZES,
  applyHomeTextSize,
  getHomeTextSizeUpdate,
  normalizeHomeTextSize,
  preferLiveHomeTextSize,
  readHomeTextSizeFromUrl,
  startHomeTextSizeSync,
  type HomeTextSizeRequest,
  type HomeTextSizeState,
} from '../homeTextSize';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const state = (
  value: HomeTextSizeState['value'],
  source: HomeTextSizeState['source'] = 'home-url',
): HomeTextSizeState => ({ value, source });

describe('Qortium Home text-size adapter', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.textSize;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete document.documentElement.dataset.textSize;
    vi.restoreAllMocks();
  });

  it.each(HOME_TEXT_SIZES)('accepts %s', (value) => {
    expect(normalizeHomeTextSize(value)).toBe(value);
  });

  it('falls back to medium for malformed and missing values', () => {
    expect(normalizeHomeTextSize('gigantic')).toBe(DEFAULT_HOME_TEXT_SIZE);
    expect(normalizeHomeTextSize(42)).toBe(DEFAULT_HOME_TEXT_SIZE);
    expect(normalizeHomeTextSize(undefined)).toBe(DEFAULT_HOME_TEXT_SIZE);
    expect(normalizeHomeTextSize(null)).toBe(DEFAULT_HOME_TEXT_SIZE);
  });

  it('reads startup textSize from the Q-App URL', () => {
    expect(readHomeTextSizeFromUrl('?textSize=huge')).toEqual({
      value: 'huge',
      source: 'home-url',
    });
    expect(readHomeTextSizeFromUrl('')).toEqual({
      value: 'medium',
      source: 'home-url',
    });
  });

  it('updates the root data-text-size state', () => {
    applyHomeTextSize('extra-large', document.documentElement);
    expect(document.documentElement.dataset.textSize).toBe('extra-large');
  });

  it('parses TEXT_SIZE_CHANGED and consolidated Home events', () => {
    expect(
      getHomeTextSizeUpdate(
        { action: 'TEXT_SIZE_CHANGED', textSize: 'small' },
        state('medium'),
      ),
    ).toEqual({ value: 'small', source: 'home-event' });

    expect(
      getHomeTextSizeUpdate(
        {
          type: 'qortium:home-settings-changed',
          detail: { textSize: 'huge' },
        },
        state('medium'),
      ),
    ).toEqual({ value: 'huge', source: 'home-event' });
  });

  it('prefers a newer live event over a slower bridge read', () => {
    expect(
      preferLiveHomeTextSize(
        state('huge', 'home-event'),
        state('small', 'home-bridge'),
      ),
    ).toEqual({ value: 'huge', source: 'home-event' });
  });

  it('applies GET_HOME_SETTINGS as a synchronization fallback', async () => {
    const request: HomeTextSizeRequest = vi.fn(async () => ({
      textSize: 'large',
    }));

    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });

    await flush();
    expect(document.documentElement.dataset.textSize).toBe('large');
    stop();
  });

  it('reacts to a live TEXT_SIZE_CHANGED message', async () => {
    const request: HomeTextSizeRequest = vi.fn(async () => ({
      textSize: 'medium',
    }));
    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'TEXT_SIZE_CHANGED', textSize: 'huge' },
        source: window,
      }),
    );
    await flush();

    expect(document.documentElement.dataset.textSize).toBe('huge');
    stop();
  });

  it('reacts to qortium:home-settings-changed messages', async () => {
    const request: HomeTextSizeRequest = vi.fn(async () => ({
      textSize: 'medium',
    }));
    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'qortium:home-settings-changed',
          detail: { textSize: 'extra-large' },
        },
        source: window,
      }),
    );
    await flush();

    expect(document.documentElement.dataset.textSize).toBe('extra-large');
    stop();
  });

  it('reacts to the desktop qortiumHomeSettingsChanged CustomEvent', async () => {
    const request: HomeTextSizeRequest = vi.fn(async () => ({
      textSize: 'medium',
    }));
    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });

    window.dispatchEvent(
      new CustomEvent('qortiumHomeSettingsChanged', {
        detail: { textSize: 'small' },
      }),
    );
    await flush();

    expect(document.documentElement.dataset.textSize).toBe('small');
    stop();
  });

  it('does not allow a slow bridge response to overwrite a newer live event', async () => {
    let resolveBridge: ((value: unknown) => void) | undefined;
    const request: HomeTextSizeRequest = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveBridge = resolve;
        }),
    );

    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'TEXT_SIZE_CHANGED', textSize: 'huge' },
        source: window,
      }),
    );
    await flush();

    resolveBridge?.({ textSize: 'small' });
    await flush();

    expect(document.documentElement.dataset.textSize).toBe('huge');
    stop();
  });

  it('remains safe when the Home bridge is unavailable', async () => {
    const request: HomeTextSizeRequest = vi.fn(async () => {
      throw new Error('bridge unavailable');
    });

    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });
    await flush();

    expect(document.documentElement.dataset.textSize).toBe('medium');
    stop();
  });

  it('cleans up message and desktop listeners', async () => {
    const request: HomeTextSizeRequest = vi.fn(async () => ({
      textSize: 'medium',
    }));
    const removeMessageSpy = vi.spyOn(window, 'removeEventListener');
    const stop = startHomeTextSizeSync({
      initial: state('medium'),
      request,
    });

    stop();
    expect(removeMessageSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
    expect(removeMessageSpy).toHaveBeenCalledWith(
      'qortiumHomeSettingsChanged',
      expect.any(Function),
    );
  });
});
