/** Shared markers for "the upstream failed" versus "the upstream was empty". */

export const UPSTREAM_FAILURE_COOLDOWN_MS = 60_000;

export function upstreamFailure(operation, detail = {}) {
  const err = new Error(`${operation}_upstream_failed`);
  err.code = 'UPSTREAM_FAILED';
  err.operation = operation;
  if (typeof detail.failureCount === 'number') err.failureCount = detail.failureCount;
  return err;
}

export function isUpstreamFailure(err) {
  return Boolean(err && err.code === 'UPSTREAM_FAILED');
}

/**
 * Every configured RSS source failed and none contributed items, including
 * last-known-good items. A successful feed with zero entries does not match.
 */
export function newswireUpstreamFailed({ sourceCount = 0, freshOkCount = 0, collectedStoryCount = 0 } = {}) {
  return sourceCount > 0 && freshOkCount === 0 && collectedStoryCount === 0;
}

/**
 * True when every configured desk reported a failed live read.
 * Unconfigured desks are ignored so local setups without Supabase still render.
 */
export function homepageDeskReadsFailed(desks) {
  const configured = (Array.isArray(desks) ? desks : []).filter((desk) => desk && desk.configured !== false);
  if (configured.length === 0) return false;
  return configured.every((desk) => desk.liveReadOk === false);
}

/**
 * An empty briefing produced by a failed dependency must not replace a cached briefing.
 * A non-empty ranked result, or a genuinely empty successful result, can be cached.
 */
export function shouldDiscardBriefingResult({ itemCount = 0, upstreamFailed = false } = {}) {
  return Boolean(upstreamFailed) && itemCount === 0;
}

export function createFailureCooldown(ms = UPSTREAM_FAILURE_COOLDOWN_MS) {
  let until = 0;
  return {
    active(now = Date.now()) {
      return now < until;
    },
    trip(now = Date.now()) {
      until = now + ms;
    },
    clear() {
      until = 0;
    },
  };
}
