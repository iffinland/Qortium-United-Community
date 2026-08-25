// ===== Qortium Home Selected-Account Change Listener =====
//
// Qortium Home dispatches a `message` event with
// `{ type: 'qortium:selected-account-changed' }` when the selected account or
// wallet lock state changes (see Home's qdn-views / home-v2 runtime
// invalidation). The event is a signal only: apps must re-read
// GET_SELECTED_ACCOUNT and refresh account-scoped identity after it arrives.

export interface AccountChangedMessage {
  type: 'qortium:selected-account-changed';
}

/**
 * Subscribe to selected-account change signals. Returns an unsubscribe
 * function. This reuses Home's proven postMessage contract rather than
 * introducing a new polling system.
 */
export function listenForAccountChanges(onChange: () => void): () => void {
  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string } | null;
    if (data?.type === 'qortium:selected-account-changed') {
      onChange();
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
