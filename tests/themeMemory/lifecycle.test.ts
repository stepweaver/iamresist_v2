import { describe, expect, it } from 'vitest';

import { THEME_LIFECYCLE_THRESHOLDS } from '@/lib/themeMemory/constants';
import { resolveThemeLifecycle } from '@/lib/themeMemory/lifecycle';

describe('Theme Memory lifecycle', () => {
  it('marks a first-day theme as new', () => {
    expect(
      resolveThemeLifecycle({
        firstSeenAt: '2026-09-01T12:00:00.000Z',
        lastCreatorActivityAt: '2026-09-01T12:00:00.000Z',
        now: '2026-09-01T18:00:00.000Z',
        activeDays7: 1,
        activeDays14: 1,
        creatorMomentum: 1,
        todayCreatorItemCount: 1,
        previousLifecycle: 'new',
      }),
    ).toBe('new');
  });

  it('becomes developing then persistent as distinct active days accumulate', () => {
    expect(
      resolveThemeLifecycle({
        firstSeenAt: '2026-09-01T12:00:00.000Z',
        lastCreatorActivityAt: '2026-09-03T12:00:00.000Z',
        now: '2026-09-03T18:00:00.000Z',
        activeDays7: 2,
        activeDays14: 2,
        creatorMomentum: 1.2,
        todayCreatorItemCount: 1,
        previousLifecycle: 'new',
      }),
    ).toBe('developing');

    expect(
      resolveThemeLifecycle({
        firstSeenAt: '2026-09-01T12:00:00.000Z',
        lastCreatorActivityAt: '2026-09-06T12:00:00.000Z',
        now: '2026-09-06T18:00:00.000Z',
        activeDays7: 4,
        activeDays14: 4,
        creatorMomentum: 1,
        todayCreatorItemCount: 1,
        previousLifecycle: 'developing',
      }),
    ).toBe('persistent');
  });

  it('becomes dormant after the configured quiet period and resurging after new creator activity', () => {
    const dormant = resolveThemeLifecycle({
      firstSeenAt: '2026-08-01T12:00:00.000Z',
      lastCreatorActivityAt: '2026-09-01T12:00:00.000Z',
      now: '2026-09-12T12:00:00.000Z',
      activeDays7: 0,
      activeDays14: 1,
      creatorMomentum: 0,
      todayCreatorItemCount: 0,
      previousLifecycle: 'persistent',
    });
    expect(dormant).toBe('dormant');
    expect(THEME_LIFECYCLE_THRESHOLDS.DORMANT_DAYS_WITHOUT_CREATOR).toBe(10);

    expect(
      resolveThemeLifecycle({
        firstSeenAt: '2026-08-01T12:00:00.000Z',
        lastCreatorActivityAt: '2026-09-13T12:00:00.000Z',
        now: '2026-09-13T18:00:00.000Z',
        activeDays7: 1,
        activeDays14: 1,
        creatorMomentum: 2,
        todayCreatorItemCount: 2,
        previousLifecycle: 'dormant',
      }),
    ).toBe('resurging');
  });
});
