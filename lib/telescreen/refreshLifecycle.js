/**
 * Refresh spinner state for the Telescreen archive.
 * router.refresh() re-reads the server render. It does not purge data caches.
 * The spinner stays on until the server props for that request arrive.
 * A later request does not get cleared by an older arrival. The timeout is
 * only a stuck-spinner guard.
 */

export function beginCollectionRefresh(state) {
  const requestId = Number(state?.requestId) || 0;
  return { requestId: requestId + 1, refreshing: true };
}

export function finishCollectionRefresh(state, arrivedRequestId) {
  if (!state?.refreshing) return state;
  if (arrivedRequestId !== state.requestId) return state;
  return { requestId: state.requestId, refreshing: false };
}
