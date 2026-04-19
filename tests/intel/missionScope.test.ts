import { describe, expect, it } from 'vitest';
import { assessMissionScope } from '@/lib/intel/missionScope';

describe('assessMissionScope', () => {
  it('classifies a sports-only item as off_topic', () => {
    const mission = assessMissionScope({
      title: 'NFL playoffs preview: quarterback battle reshapes Super Bowl odds',
      summary: 'Analysts break down the point spread and fantasy implications.',
    });

    expect(mission.scopeState).toBe('off_topic');
    expect(mission.hardOffTopic).toBe(true);
    expect(mission.softOffTopic).toBe(false);
    expect(mission.allowedOnIntelDesk).toBe(false);
    expect(mission.reason).toMatch(/sports-only/i);
  });

  it('classifies an entertainment or lifestyle-only item as off_topic', () => {
    const mission = assessMissionScope({
      title: 'Celebrity fashion dominates the red carpet before the music festival',
      summary: 'Streaming stars arrive as gossip and album rumors spread.',
    });

    expect(mission.scopeState).toBe('off_topic');
    expect(mission.hardOffTopic).toBe(false);
    expect(mission.softOffTopic).toBe(true);
    expect(mission.allowedOnIntelDesk).toBe(false);
    expect(mission.reason).toMatch(/entertainment \/ lifestyle/i);
  });

  it('classifies a clear mission-aligned political item as in_scope', () => {
    const mission = assessMissionScope({
      title: 'Congress opens oversight hearing into White House surveillance policy',
      summary: 'Lawmakers and a federal judge are examining civil rights and accountability concerns.',
    });

    expect(mission.scopeState).toBe('in_scope');
    expect(mission.allowedOnHomepageCommentary).toBe(true);
    expect(mission.allowedOnIntelDesk).toBe(true);
    expect(mission.reason).toMatch(/^In-scope:/);
  });

  it('classifies a clear war or geopolitics item as in_scope', () => {
    const mission = assessMissionScope({
      title: 'Russia launches missile and drone strikes as NATO diplomats meet on Ukraine',
      summary: 'Officials discuss sanctions, civilians, and ceasefire pressure.',
    });

    expect(mission.scopeState).toBe('in_scope');
    expect(mission.allowedOnHomepageCommentary).toBe(true);
    expect(mission.allowedOnIntelDesk).toBe(true);
    expect(mission.positiveHits).toEqual(expect.arrayContaining(['russia', 'missile', 'drone', 'nato', 'ukraine']));
  });

  it('classifies a broad breaking item with no strong anchor as ambiguous', () => {
    const mission = assessMissionScope({
      title: 'Breaking: crews respond after major blast shuts down port operations',
      summary: 'Officials say emergency teams are still assessing damage and disruptions.',
    });

    expect(mission.scopeState).toBe('ambiguous');
    expect(mission.hardOffTopic).toBe(false);
    expect(mission.softOffTopic).toBe(false);
    expect(mission.allowedOnHomepageCommentary).toBe(false);
    expect(mission.allowedOnIntelDesk).toBe(true);
    expect(mission.reason).toBe('Ambiguous: broad current-events item with no strong mission anchor');
  });

  it('preserves legacy compatibility fields derived from scope state', () => {
    const sportsMission = assessMissionScope({
      title: 'NBA playoffs scoreboard update as coach weighs quarterback rumors',
      summary: 'Fantasy chatter builds around the latest point spread.',
    });
    const politicalMission = assessMissionScope({
      title: 'President faces congressional oversight after executive order challenge',
      summary: 'A federal court hearing focuses on democracy and civil rights concerns.',
    });
    const ambiguousMission = assessMissionScope({
      title: 'Breaking: airport disruption triggers emergency response and travel delays',
      summary: 'Authorities say investigators are still piecing together what happened.',
    });

    expect(sportsMission).toEqual(
      expect.objectContaining({
        scopeState: 'off_topic',
        allowedOnHomepageCommentary: false,
        allowedOnIntelDesk: false,
        hardOffTopic: true,
        softOffTopic: false,
        positiveHits: expect.any(Array),
        sportsHits: expect.any(Array),
        softOffTopicHits: expect.any(Array),
        scoreDelta: expect.any(Number),
        reason: expect.stringMatching(/Off-topic: sports-only item/i),
      }),
    );

    expect(politicalMission).toEqual(
      expect.objectContaining({
        scopeState: 'in_scope',
        allowedOnHomepageCommentary: true,
        allowedOnIntelDesk: true,
        hardOffTopic: false,
        softOffTopic: false,
      }),
    );

    expect(ambiguousMission).toEqual(
      expect.objectContaining({
        scopeState: 'ambiguous',
        allowedOnHomepageCommentary: false,
        allowedOnIntelDesk: true,
        hardOffTopic: false,
        softOffTopic: false,
      }),
    );
  });
});
