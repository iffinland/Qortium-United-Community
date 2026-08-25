// ===== QDN Image URL Hook =====
//
// Resolves a canonical QDN image reference to a browser-loadable render URL
// through the Qortium Home bridge, with bounded recovery when the browser
// cannot decode the image. Adapted from the proven Qortium Blogs hook.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { QdnImageRef } from '../types';
import { getResourceStatus, getQdnResourceUrl } from '../services/qdn/qdnImageService';
import { requestQortium } from '../services/qortium/qortiumClient';

const MAX_RETRY_CHECKS = 2;
const RETRY_DELAY_MS = 2_000;

export function useQdnImageUrl(
  refData: QdnImageRef,
  fallbackSrc?: string,
): {
  url: string;
  handleError: () => void;
} {
  const [url, setUrl] = useState('');

  const activeRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCheckCountRef = useRef(0);
  const errorCountRef = useRef(0);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    retryCheckCountRef.current = 0;
    errorCountRef.current = 0;
    clearRetryTimer();

    let ignore = false;
    void getQdnResourceUrl(refData)
      .then((resourceUrl) => {
        if (ignore || !activeRef.current) return;
        setUrl(resourceUrl);
      })
      .catch(() => {
        if (ignore || !activeRef.current) return;
        setUrl(fallbackSrc ?? '');
      });

    return () => {
      ignore = true;
      activeRef.current = false;
      clearRetryTimer();
    };
  }, [refData, fallbackSrc, clearRetryTimer]);

  const bustCache = useCallback((baseUrl: string): string => {
    const match = baseUrl.match(/[?&]cb=(\d+)/);
    const next = match ? parseInt(match[1], 10) + 1 : 1;
    const stripped = baseUrl.replace(/[?&]cb=\d+/g, '');
    const sep = stripped.includes('?') ? '&' : '?';
    return `${stripped}${sep}cb=${next}`;
  }, []);

  const handleError = useCallback(() => {
    if (!activeRef.current || !url) return;

    const attempt = errorCountRef.current + 1;
    if (attempt > MAX_RETRY_CHECKS + 1) {
      if (fallbackSrc !== undefined && url !== fallbackSrc) {
        setUrl(fallbackSrc);
      }
      return;
    }

    errorCountRef.current = attempt;

    void (async () => {
      try {
        const status = await getResourceStatus(refData.service, refData.name, refData.identifier);

        if (!activeRef.current) return;

        if (status.status === 'READY') {
          setUrl(bustCache(url));
          return;
        }

        if (status.status === 'NOT_PUBLISHED') {
          if (fallbackSrc !== undefined && url !== fallbackSrc) {
            setUrl(fallbackSrc);
          }
          return;
        }

        retryCheckCountRef.current = 0;

        const pollForReady = async () => {
          if (!activeRef.current) return;

          if (retryCheckCountRef.current >= MAX_RETRY_CHECKS) {
            if (fallbackSrc !== undefined && url !== fallbackSrc) {
              setUrl(fallbackSrc);
            }
            return;
          }

          const pollStatus = await getResourceStatus(
            refData.service,
            refData.name,
            refData.identifier,
          );

          if (!activeRef.current) return;
          retryCheckCountRef.current += 1;

          if (pollStatus.status === 'READY') {
            setUrl(bustCache(url));
            return;
          }

          if (pollStatus.status === 'NOT_PUBLISHED') {
            if (fallbackSrc !== undefined && url !== fallbackSrc) {
              setUrl(fallbackSrc);
            }
            return;
          }

          if (retryCheckCountRef.current < MAX_RETRY_CHECKS) {
            retryTimerRef.current = setTimeout(pollForReady, RETRY_DELAY_MS);
          } else if (fallbackSrc !== undefined && url !== fallbackSrc) {
            setUrl(fallbackSrc);
          }
        };

        requestQortium<unknown>({
          action: 'GET_QDN_RESOURCE_STATUS',
          service: refData.service,
          name: refData.name,
          identifier: refData.identifier,
          build: true,
        }).catch(() => undefined);

        retryTimerRef.current = setTimeout(pollForReady, RETRY_DELAY_MS);
      } catch {
        if (activeRef.current && fallbackSrc !== undefined && url !== fallbackSrc) {
          setUrl(fallbackSrc);
        }
      }
    })();
  }, [url, refData, fallbackSrc, bustCache]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  return { url, handleError };
}
