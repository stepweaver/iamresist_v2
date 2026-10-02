import { describe, expect, it } from 'vitest';

import { buildHeadlineTimeline } from '@/lib/headlineTimeline/build';
import { candidateFromNewswireStory, candidateFromSourceItem } from '@/lib/headlineTimeline/candidates';
import { clusterHeadlineCandidates } from '@/lib/headlineTimeline/cluster';
import { compareTitles } from '@/lib/headlineTimeline/similarity';
import { scoreHeadlineMembers } from '@/lib/headlineTimeline/rank';
import type { HeadlineCandidate, HeadlineNoteSeed } from '@/lib/headlineTimeline/types';

const NOW = new Date('2026-10-02T18:00:00.000Z');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3600000).toISOString();
}

function candidate(overrides: Partial<HeadlineCandidate> & Pick<HeadlineCandidate, 'id' | 'title'>): HeadlineCandidate {
  return {
    sourceId: overrides.sourceId || `src:${overrides.id}`,
    sourceName: overrides.sourceName || 'Source',
    sourceKind: overrides.sourceKind || 'news',
    channel: overrides.channel || (overrides.sourceKind === 'creator' ? 'voices' : 'intel'),
    url: overrides.url || `https://example.com/${overrides.id}`,
    publishedAt: overrides.publishedAt === undefined ? hoursAgo(2) : overrides.publishedAt,
    summary: overrides.summary ?? null,
    ...overrides,
  };
}

describe('headline title similarity', () => {
  it('treats the $5,000 plan headlines as the same story', () => {
    const match = compareTitles(
      'Trump Announces $5,000 Plan',
      "Trump's $5,000 Proposal Explained",
    );
    expect(match.score).toBeGreaterThanOrEqual(0.6);
    expect(match.cluster).toBe(true);
    expect(match.sharedNumbers).toContain('5000');
    expect(match.sharedSupport).toEqual(expect.arrayContaining(['trump', '5000']));
  });

  it('does not cluster a rally with the payment plan just because both mention Trump', () => {
    const match = compareTitles(
      'Trump Announces $5,000 Plan',
      'Trump Holds Rally in Michigan',
    );
    expect(match.cluster).toBe(false);
    expect(match.score).toBeLessThan(0.25);
    expect(match.sharedSupport).toEqual(['trump']);
  });

  it('treats a shared dollar amount plus another real token as a strong signal', () => {
    const match = compareTitles(
      'White House floats a $5,000 payment',
      'What the $5,000 payment means for households',
    );
    expect(match.sharedNumbers).toEqual(['5000']);
    expect(match.sharedSupport).toEqual(expect.arrayContaining(['5000', 'payment']));
    expect(match.cluster).toBe(true);
    expect(match.score).toBeGreaterThanOrEqual(0.6);
  });

  it('treats 29,000 jobs headlines as the same story when they share that figure', () => {
    const match = compareTitles(
      "Trump's Iran war puts 29,000 jobs at risk",
      'The Iran war could cost 29,000 jobs',
    );
    expect(match.sharedNumbers).toContain('29000');
    expect(match.sharedSupport).toEqual(expect.arrayContaining(['29000', 'jobs', 'iran', 'war']));
    expect(match.sharedAnchors).toEqual(expect.arrayContaining(['29000', 'jobs']));
    expect(match.cluster).toBe(true);
  });

  it('does not cluster Barrett defense cash with a family farm price story on Iran-war context alone', () => {
    const match = compareTitles(
      'Michigan Republican Tom Barrett Is Now Sour On Trump’s War in Iran—But Still Took Plenty of Defense Cash',
      'Family farm may have to CLOSE after 100 years due to soaring prices from Trump’s Iran war',
    );
    expect(match.sharedSupport).toEqual(['trump', 'war', 'iran']);
    expect(match.sharedAnchors).toEqual([]);
    expect(match.sharedNumbers).toEqual([]);
    expect(match.cluster).toBe(false);
  });

  it('does not glue separate Trump videos together through shorts and midterm filler', () => {
    const match = compareTitles(
      'Trump is really doubling down on this "everything is great" message ahead of the midterms #shorts',
      'DISASTER: Trump makes MASSIVE MISTAKE ahead of midterms',
    );
    expect(match.cluster).toBe(false);
  });

  it('keeps the same titles apart when they are weeks apart', () => {
    const match = compareTitles(
      'Trump Announces $5,000 Plan',
      "Trump's $5,000 Proposal Explained",
      { a: '2026-09-01T12:00:00.000Z', b: '2026-10-02T12:00:00.000Z' },
    );
    expect(match.score).toBeGreaterThanOrEqual(0.6);
    expect(match.cluster).toBe(false);
  });
});

describe('headline clustering and ranking', () => {
  it('groups the payment headlines and leaves the rally alone', () => {
    const drafts = clusterHeadlineCandidates([
      candidate({ id: 'a', title: 'Trump Announces $5,000 Plan', publishedAt: hoursAgo(3) }),
      candidate({ id: 'b', title: "Trump's $5,000 Proposal Explained", publishedAt: hoursAgo(2) }),
      candidate({ id: 'c', title: "What Trump's $5,000 plan means", publishedAt: hoursAgo(1) }),
      candidate({ id: 'd', title: 'Trump Holds Rally in Michigan', publishedAt: hoursAgo(1) }),
    ]);
    const payment = drafts.find((draft) => draft.members.some((member) => member.id === 'a'));
    const rally = drafts.find((draft) => draft.members.some((member) => member.id === 'd'));
    expect(payment?.members.map((member) => member.id).sort()).toEqual(['a', 'b', 'c']);
    expect(rally?.members.map((member) => member.id)).toEqual(['d']);
    expect(payment?.id).not.toBe(rally?.id);
  });

  it('keeps the Barrett story and the family-farm story in separate clusters', () => {
    const drafts = clusterHeadlineCandidates([
      candidate({
        id: 'barrett',
        title: 'Michigan Republican Tom Barrett Is Now Sour On Trump’s War in Iran—But Still Took Plenty of Defense Cash',
        sourceKind: 'news',
        sourceId: 'newswire:ap',
      }),
      candidate({
        id: 'farm',
        title: 'Family farm may have to CLOSE after 100 years due to soaring prices from Trump’s Iran war',
        sourceKind: 'creator',
        sourceId: 'voices:pakman',
      }),
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.members.map((member) => member.id))).toEqual([['barrett'], ['farm']]);
  });

  it('counts five posts from one creator as one creator', () => {
    const members = [0, 1, 2, 3, 4].map((index) => ({
      sourceId: 'voices:pakman',
      sourceKind: 'creator' as const,
      publishedAt: hoursAgo(index),
    }));
    const rank = scoreHeadlineMembers(members, NOW);
    expect(rank.uniqueCreators).toBe(1);
    expect(rank.itemCount).toBe(5);
    expect(rank.creatorPoints).toBe(40);
    expect(rank.repeatPoints).toBeLessThanOrEqual(6);
  });

  it('ranks creator-and-news convergence above a single creator', () => {
    const mixed = scoreHeadlineMembers(
      [
        { sourceId: 'voices:pakman', sourceKind: 'creator', publishedAt: hoursAgo(4) },
        { sourceId: 'voices:meidas', sourceKind: 'creator', publishedAt: hoursAgo(3) },
        { sourceId: 'newswire:ap', sourceKind: 'news', publishedAt: hoursAgo(3) },
        { sourceId: 'newswire:reuters', sourceKind: 'news', publishedAt: hoursAgo(2) },
        { sourceId: 'intel:propublica', sourceKind: 'news', publishedAt: hoursAgo(2) },
      ],
      NOW,
    );
    const solo = scoreHeadlineMembers(
      [{ sourceId: 'voices:pakman', sourceKind: 'creator', publishedAt: hoursAgo(1) }],
      NOW,
    );
    expect(mixed.uniqueCreators).toBe(2);
    expect(mixed.uniqueNewsSources).toBe(3);
    expect(mixed.crossSource).toBe(true);
    expect(solo.uniqueCreators).toBe(1);
    expect(solo.crossSource).toBe(false);
    expect(mixed.score).toBeGreaterThan(solo.score);
  });

  it('ranks newer activity above stale activity when convergence matches', () => {
    const shape = [
      { sourceId: 'voices:pakman', sourceKind: 'creator' as const },
      { sourceId: 'newswire:ap', sourceKind: 'news' as const },
    ];
    const recent = scoreHeadlineMembers(
      shape.map((item) => ({ ...item, publishedAt: hoursAgo(1) })),
      NOW,
    );
    const stale = scoreHeadlineMembers(
      shape.map((item) => ({ ...item, publishedAt: hoursAgo(30) })),
      NOW,
    );
    expect(recent.uniqueCreators).toBe(stale.uniqueCreators);
    expect(recent.uniqueNewsSources).toBe(stale.uniqueNewsSources);
    expect(recent.recencyPoints).toBeGreaterThan(stale.recencyPoints);
    expect(recent.score).toBeGreaterThan(stale.score);
  });

  it('builds a brief from real titles, prefers a news headline, and attaches notes by source item id', () => {
    const notes: HeadlineNoteSeed[] = [
      {
        id: 'note-1',
        sourceItemId: 'pakman-1',
        kind: 'creator_analysis',
        text: 'Pakman walks through who would receive the payment.',
        contentRole: 'editorial',
        startSeconds: 120,
        endSeconds: 180,
        createdAt: hoursAgo(2),
      },
      {
        id: 'note-sponsor',
        sourceItemId: 'pakman-1',
        kind: 'creator_analysis',
        text: 'Use the offer code.',
        contentRole: 'sponsor_read',
        startSeconds: 10,
        endSeconds: 20,
        createdAt: hoursAgo(2),
      },
      {
        id: 'note-other',
        sourceItemId: 'unrelated',
        kind: 'event',
        text: 'This note belongs to a different episode.',
        contentRole: 'editorial',
        startSeconds: null,
        endSeconds: null,
        createdAt: hoursAgo(2),
      },
    ];

    const timeline = buildHeadlineTimeline({
      now: NOW,
      candidates: [
        candidate({
          id: 'pakman-1',
          title: "What Trump's $5,000 payment plan means",
          sourceId: 'voices:pakman',
          sourceName: 'David Pakman',
          sourceKind: 'creator',
          channel: 'voices',
          url: 'https://www.youtube.com/watch?v=abc',
          publishedAt: hoursAgo(5),
        }),
        candidate({
          id: 'pakman-2',
          title: "Trump's $5,000 payment plan, again",
          sourceId: 'voices:pakman',
          sourceName: 'David Pakman',
          sourceKind: 'creator',
          channel: 'voices',
          publishedAt: hoursAgo(4),
        }),
        candidate({
          id: 'meidas-1',
          title: 'Trump $5,000 payment plan draws questions',
          sourceId: 'voices:meidas',
          sourceName: 'MeidasTouch',
          sourceKind: 'creator',
          channel: 'voices',
          publishedAt: hoursAgo(3),
        }),
        candidate({
          id: 'nw-1',
          title: 'Trump announces $5,000 payment plan',
          sourceId: 'newswire:ap',
          sourceName: 'Associated Press',
          sourceKind: 'news',
          channel: 'newswire',
          summary: 'The White House described a one-time payment.',
          publishedAt: hoursAgo(3),
        }),
        candidate({
          id: 'nw-2',
          title: 'White House outlines $5,000 payment plan',
          sourceId: 'newswire:reuters',
          sourceName: 'Reuters',
          sourceKind: 'news',
          channel: 'newswire',
          publishedAt: hoursAgo(2),
        }),
        candidate({
          id: 'nw-3',
          title: 'Questions follow the $5,000 payment plan',
          sourceId: 'intel:propublica',
          sourceName: 'ProPublica',
          sourceKind: 'news',
          channel: 'intel',
          publishedAt: hoursAgo(2),
        }),
        candidate({
          id: 'rally',
          title: 'Trump holds rally in Michigan',
          sourceId: 'voices:solo',
          sourceName: 'Solo Creator',
          sourceKind: 'creator',
          channel: 'voices',
          publishedAt: hoursAgo(1),
        }),
      ],
      notes,
    });

    const shown = timeline.days.flatMap((day) => day.clusters);
    expect(shown[0].uniqueCreators).toBe(2);
    expect(shown[0].uniqueNewsSources).toBe(3);
    expect(shown[0].headline.toLowerCase()).toContain('5,000');
    expect(shown[0].headline.toLowerCase()).not.toContain('what trump');
    expect(shown[0].members.map((member) => member.id)).not.toContain('rally');
    expect(shown.some((cluster) => cluster.members.some((member) => member.id === 'rally'))).toBe(false);
    expect(shown[0].summary).toBe('The White House described a one-time payment.');
    expect(shown[0].creators.map((creator) => creator.creatorName)).toContain('David Pakman');
    const pakman = shown[0].creators.find((creator) => creator.creatorName === 'David Pakman');
    expect(pakman?.notes.map((note) => note.id)).toEqual(['note-1']);
    expect(pakman?.notes[0].evidenceUrl).toContain('t=120');
  });
});

describe('primary brief qualification', () => {
  function shownClusters(candidates: HeadlineCandidate[]) {
    return buildHeadlineTimeline({ now: NOW, candidates }).days.flatMap((day) => day.clusters);
  }

  it('hides one creator and no news sources', () => {
    const shown = shownClusters([
      candidate({
        id: 'pakman-1',
        title: 'Trump Announces $5,000 Plan',
        sourceId: 'voices:pakman',
        sourceName: 'David Pakman',
        sourceKind: 'creator',
      }),
    ]);
    expect(shown).toHaveLength(0);
  });

  it('shows two distinct creators and no news sources', () => {
    const shown = shownClusters([
      candidate({
        id: 'pakman-1',
        title: 'Trump Announces $5,000 Plan',
        sourceId: 'voices:pakman',
        sourceName: 'David Pakman',
        sourceKind: 'creator',
      }),
      candidate({
        id: 'meidas-1',
        title: "Trump's $5,000 Proposal Explained",
        sourceId: 'voices:meidas',
        sourceName: 'MeidasTouch',
        sourceKind: 'creator',
      }),
    ]);
    expect(shown).toHaveLength(1);
    expect(shown[0].uniqueCreators).toBe(2);
    expect(shown[0].uniqueNewsSources).toBe(0);
    expect(shown[0].members.map((member) => member.id).sort()).toEqual(['meidas-1', 'pakman-1']);
  });

  it('shows one creator and one news source', () => {
    const shown = shownClusters([
      candidate({
        id: 'pakman-1',
        title: 'Trump Announces $5,000 Plan',
        sourceId: 'voices:pakman',
        sourceName: 'David Pakman',
        sourceKind: 'creator',
      }),
      candidate({
        id: 'ap-1',
        title: "Trump's $5,000 Proposal Explained",
        sourceId: 'newswire:ap',
        sourceName: 'Associated Press',
        sourceKind: 'news',
      }),
    ]);
    expect(shown).toHaveLength(1);
    expect(shown[0].uniqueCreators).toBe(1);
    expect(shown[0].uniqueNewsSources).toBe(1);
  });

  it('shows two distinct news sources and no creators', () => {
    const shown = shownClusters([
      candidate({
        id: 'ap-1',
        title: 'Trump Announces $5,000 Plan',
        sourceId: 'newswire:ap',
        sourceName: 'Associated Press',
        sourceKind: 'news',
      }),
      candidate({
        id: 'reuters-1',
        title: "Trump's $5,000 Proposal Explained",
        sourceId: 'newswire:reuters',
        sourceName: 'Reuters',
        sourceKind: 'news',
      }),
    ]);
    expect(shown).toHaveLength(1);
    expect(shown[0].uniqueCreators).toBe(0);
    expect(shown[0].uniqueNewsSources).toBe(2);
  });

  it('hides a single news source with no creator', () => {
    const shown = shownClusters([
      candidate({
        id: 'ap-1',
        title: 'Trump Announces $5,000 Plan',
        sourceId: 'newswire:ap',
        sourceName: 'Associated Press',
        sourceKind: 'news',
      }),
    ]);
    expect(shown).toHaveLength(0);
  });

  it('does not treat repeated items from one creator as two creators', () => {
    const items = [0, 1, 2].map((index) =>
      candidate({
        id: `pakman-${index}`,
        title: 'Trump Announces $5,000 Plan',
        sourceId: 'voices:pakman',
        sourceName: 'David Pakman',
        sourceKind: 'creator',
        publishedAt: hoursAgo(index + 1),
      }),
    );
    const drafts = clusterHeadlineCandidates(items);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].members).toHaveLength(3);
    const rank = scoreHeadlineMembers(drafts[0].members, NOW);
    expect(rank.uniqueCreators).toBe(1);
    expect(rank.uniqueNewsSources).toBe(0);

    const timeline = buildHeadlineTimeline({ now: NOW, candidates: items });
    expect(timeline.candidateCount).toBe(3);
    expect(timeline.days.flatMap((day) => day.clusters)).toHaveLength(0);
  });

  it('keeps an unqualified singleton available so a related item can qualify the cluster', () => {
    const first = candidate({
      id: 'pakman-1',
      title: 'Trump Announces $5,000 Plan',
      sourceId: 'voices:pakman',
      sourceName: 'David Pakman',
      sourceKind: 'creator',
      publishedAt: hoursAgo(10),
    });
    const alone = buildHeadlineTimeline({ now: NOW, candidates: [first] });
    expect(alone.candidateCount).toBe(1);
    expect(alone.days.flatMap((day) => day.clusters)).toHaveLength(0);

    const joined = buildHeadlineTimeline({
      now: NOW,
      candidates: [
        first,
        candidate({
          id: 'ap-1',
          title: "Trump's $5,000 Proposal Explained",
          sourceId: 'newswire:ap',
          sourceName: 'Associated Press',
          sourceKind: 'news',
          publishedAt: hoursAgo(1),
        }),
      ],
    });
    const shown = joined.days.flatMap((day) => day.clusters);
    expect(shown).toHaveLength(1);
    expect(shown[0].members.map((member) => member.id).sort()).toEqual(['ap-1', 'pakman-1']);
  });
});

describe('headline candidate collection', () => {
  it('keeps creator voices distinct from news and newswire rows', () => {
    const voice = candidateFromSourceItem({
      id: 'item-1',
      title: 'Episode title',
      summary: null,
      canonical_url: 'https://example.com/ep',
      published_at: hoursAgo(1),
      surface_state: 'surfaced',
      sources: { id: 'src-1', slug: 'pakman', name: 'David Pakman', provenance_class: 'COMMENTARY', desk_lane: 'voices' },
    });
    const osint = candidateFromSourceItem({
      id: 'item-2',
      title: 'Agency posting',
      summary: 'A filing.',
      canonical_url: 'https://example.com/filing',
      published_at: hoursAgo(1),
      surface_state: 'surfaced',
      sources: { id: 'src-2', slug: 'gao', name: 'GAO', provenance_class: 'PRIMARY', desk_lane: 'osint' },
    });
    const wire = candidateFromNewswireStory({
      id: 'story-1',
      title: 'Wire headline',
      url: 'https://example.com/wire',
      publishedAt: hoursAgo(1),
      source: 'The Intercept',
      sourceSlug: 'intercept',
      excerpt: 'Excerpt from the feed.',
    });

    expect(voice).toMatchObject({ sourceKind: 'creator', channel: 'voices', sourceName: 'David Pakman' });
    expect(osint).toMatchObject({ sourceKind: 'news', channel: 'intel', sourceName: 'GAO' });
    expect(wire).toMatchObject({ sourceKind: 'news', channel: 'newswire', sourceId: 'newswire:intercept' });
  });

  it('drops promo roundups and live sports boards before clustering', () => {
    const timeline = buildHeadlineTimeline({
      now: NOW,
      candidates: [
        candidate({ id: 'promo', title: 'Columbia Promo Codes: 15% Off | October 2026' }),
        candidate({ id: 'sports', title: 'LIVE: France vs Italy – UEFA Nations League' }),
        candidate({ id: 'real', title: 'Trump announces $5,000 payment plan', sourceKind: 'news', sourceId: 'newswire:ap' }),
      ],
    });
    expect(timeline.candidateCount).toBe(1);
    expect(timeline.newsCandidateCount).toBe(1);
    const ids = timeline.days.flatMap((day) => day.clusters.flatMap((cluster) => cluster.members.map((member) => member.id)));
    expect(ids).not.toContain('promo');
    expect(ids).not.toContain('sports');
    expect(ids).not.toContain('real');
  });
});
