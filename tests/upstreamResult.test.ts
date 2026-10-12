import { describe, expect, it } from 'vitest';
import {
  createFailureCooldown,
  homepageDeskReadsFailed,
  newswireUpstreamFailed,
  shouldDiscardBriefingResult,
  upstreamFailure,
  UPSTREAM_FAILURE_COOLDOWN_MS,
} from '@/lib/feeds/upstreamResult';
import {
  clearLastKnownGoodForTests,
  readThroughLastKnownGood,
  recallLastKnownGood,
} from '@/lib/feeds/lastKnownGood';

describe('upstream failure versus empty results', () => {
  it('treats a total RSS miss as failure and a successful empty fetch as empty', () => {
    expect(newswireUpstreamFailed({ sourceCount: 4, freshOkCount: 0, collectedStoryCount: 0 })).toBe(true);
    expect(newswireUpstreamFailed({ sourceCount: 4, freshOkCount: 4, collectedStoryCount: 0 })).toBe(false);
    expect(newswireUpstreamFailed({ sourceCount: 4, freshOkCount: 1, collectedStoryCount: 2 })).toBe(false);
    expect(newswireUpstreamFailed({ sourceCount: 4, freshOkCount: 0, collectedStoryCount: 2 })).toBe(false);
    expect(newswireUpstreamFailed({ sourceCount: 0, freshOkCount: 0, collectedStoryCount: 0 })).toBe(false);
  });

  it('discards an empty briefing only when a dependency failed', () => {
    expect(shouldDiscardBriefingResult({ itemCount: 0, upstreamFailed: true })).toBe(true);
    expect(shouldDiscardBriefingResult({ itemCount: 0, upstreamFailed: false })).toBe(false);
    expect(shouldDiscardBriefingResult({ itemCount: 3, upstreamFailed: true })).toBe(false);
    expect(shouldDiscardBriefingResult({ itemCount: 3, upstreamFailed: true, newswireFailed: true })).toBe(true);
    expect(shouldDiscardBriefingResult({ itemCount: 3, newswireFailed: false })).toBe(false);
  });

  it('ignores unconfigured desks and flags a total live-read failure', () => {
    expect(homepageDeskReadsFailed([{ configured: false, liveReadOk: false }])).toBe(false);
    expect(
      homepageDeskReadsFailed([
        { configured: true, liveReadOk: false },
        { configured: true, liveReadOk: true },
      ]),
    ).toBe(false);
    expect(
      homepageDeskReadsFailed([
        { configured: true, liveReadOk: false },
        { configured: true, liveReadOk: false },
      ]),
    ).toBe(true);
  });
});

describe('last known good', () => {
  it('returns the previous payload after an upstream failure and keeps a real empty result empty', async () => {
    clearLastKnownGoodForTests();
    await readThroughLastKnownGood('sample', async () => ['story-a']);

    const failed = await readThroughLastKnownGood('sample', async () => {
      throw upstreamFailure('sample');
    });
    expect(failed).toEqual(['story-a']);

    const empty = await readThroughLastKnownGood('sample', async () => [], { authoritativeEmpty: true });
    expect(empty).toEqual([]);
    expect(recallLastKnownGood('sample')).toBeNull();

    await expect(
      readThroughLastKnownGood('sample', async () => {
        throw upstreamFailure('sample');
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
  });

  it('does not let a non-upstream error masquerade as an empty payload', async () => {
    clearLastKnownGoodForTests();
    await expect(
      readThroughLastKnownGood('sample', async () => {
        throw new Error('bug');
      }),
    ).rejects.toThrow('bug');
  });
});

describe('failure cooldown', () => {
  it('stays open until the window elapses', () => {
    const cooldown = createFailureCooldown(UPSTREAM_FAILURE_COOLDOWN_MS);
    const start = 1_000;
    expect(cooldown.active(start)).toBe(false);
    cooldown.trip(start);
    expect(cooldown.active(start + UPSTREAM_FAILURE_COOLDOWN_MS - 1)).toBe(true);
    expect(cooldown.active(start + UPSTREAM_FAILURE_COOLDOWN_MS)).toBe(false);
    cooldown.clear();
    expect(cooldown.active(start + 1)).toBe(false);
  });
});
