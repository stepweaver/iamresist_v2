import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { computeAgendaPulseScore } from '@/lib/intel/agendaPulse';
import { parseCongressGovJson } from '@/lib/intel/congressGov';
import { promoteGlobally } from '@/lib/intel/globalPromotion';
import { mergeAndRankBriefingCandidates } from '@/lib/feeds/homepageBriefing.service';
import { BRIEFING_LANE_WEIGHT } from '@/lib/feeds/homepageBriefing.weights';
import type { BriefingLane } from '@/lib/feeds/homepageBriefing.weights';

function mkIntel(partial: Partial<any>) {
  return {
    id: partial.id ?? 'id',
    title: partial.title ?? 'T',
    summary: partial.summary ?? null,
    canonicalUrl: partial.canonicalUrl ?? `https://example.test/${partial.id ?? 'id'}`,
    publishedAt: partial.publishedAt ?? '2026-04-27T10:00:00.000Z',
    provenanceClass: partial.provenanceClass ?? 'PRIMARY',
    sourceName: partial.sourceName ?? 'Congress.gov',
    sourceSlug: partial.sourceSlug ?? 'congress-bills-recent',
    sourceFamily: partial.sourceFamily ?? 'congress_primary',
    deskLane: partial.deskLane ?? 'osint',
    missionTags: partial.missionTags ?? ['congress'],
    clusterKeys: partial.clusterKeys ?? {},
    surfaceState: partial.surfaceState ?? 'surfaced',
    isDuplicateLoser: false,
    displayPriority: partial.displayPriority ?? 60,
    stateChangeType: partial.stateChangeType ?? 'bill_action',
    structured: partial.structured ?? {},
    institutionalArea: partial.institutionalArea ?? 'congress',
    trustWarningMode: partial.trustWarningMode ?? 'none',
  };
}

function candidate(item: any, rawScore = item.displayPriority ?? 60, origin: 'promoted' | 'lane_backstop' = 'lane_backstop') {
  const lane = (item.deskLane ?? 'osint') as BriefingLane;
  return {
    kind: 'intel' as const,
    briefLane: lane,
    briefingOrigin: origin,
    rawScore,
    weightedScore: rawScore * BRIEFING_LANE_WEIGHT[lane],
    intelItem: item,
  };
}

describe('Congress.gov API normalization', () => {
  it('parses committee meetings with witness documents into primary agenda records without API keys in URLs', () => {
    const items = parseCongressGovJson(
      JSON.stringify({
        committeeMeetings: [
          {
            eventId: '117001',
            congress: 119,
            chamber: 'House',
            type: 'Hearing',
            title: 'Oversight hearing on Section 702 surveillance authority',
            meetingStatus: 'Scheduled',
            date: '2026-04-28T14:00:00Z',
            url: 'https://api.congress.gov/v3/committee-meeting/119/house/117001?api_key=SECRET&format=json',
            witnesses: { item: [{ name: 'Jane Witness', organization: 'Privacy Board' }] },
            witnessDocuments: {
              item: [{ documentType: 'Witness Statement', format: 'PDF', url: 'https://www.congress.gov/doc.pdf' }],
            },
          },
        ],
      }),
      {
        sourceSlug: 'congress-committee-meetings-house',
        provenanceClass: 'PRIMARY',
        contentUseMode: 'feed_summary',
        fetchKind: 'congress_api',
      },
    );

    expect(items).toHaveLength(1);
    expect(items[0].stateChangeType).toBe('witness_statement_posted');
    expect(items[0].canonicalUrl).not.toContain('SECRET');
    expect(items[0].structured.public_consequence_tags).toContain('surveillance_privacy');
  });
});

describe('Agenda Pulse scoring', () => {
  it('B. does not treat a creator/commentary item alone as proof', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'));

    const creator = mkIntel({
      id: 'creator-only',
      title: 'Creator says a major hearing may be coming',
      provenanceClass: 'COMMENTARY',
      sourceSlug: 'trusted-creator',
      sourceFamily: 'claims_public',
      deskLane: 'voices',
      displayPriority: 90,
      missionTags: ['congress'],
      stateChangeType: 'commentary_item',
    });
    const primary = mkIntel({
      id: 'primary-vote',
      title: 'House roll-call vote recorded on oversight resolution',
      stateChangeType: 'house_roll_call_vote',
      displayPriority: 62,
      clusterKeys: { house_vote: '119-2-404' },
    });

    const out = promoteGlobally([creator, primary], { limit: 2 });
    expect(out[0].representativeId).toBe('primary-vote');
    const creatorCluster = out.find((cluster) => cluster.representativeId === 'creator-only');
    expect(creatorCluster?.decision.contributions.some((c) => c.code === 'agenda_pulse' && c.delta > 0)).toBe(false);

    vi.useRealTimers();
  });

  it('C. boosts creator signal when a Congress.gov primary record corroborates it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'));

    const primary = mkIntel({
      id: 'hearing-primary',
      title: 'Oversight hearing on detention infrastructure scheduled',
      stateChangeType: 'committee_meeting',
      publishedAt: '2026-04-28T14:00:00.000Z',
      clusterKeys: { committee_meeting: '119-house-117001' },
      structured: { public_consequence_tags: ['carceral_infrastructure'] },
      displayPriority: 64,
    });
    const creator = mkIntel({
      id: 'hearing-creator',
      title: 'Creator flags upcoming detention infrastructure hearing',
      provenanceClass: 'COMMENTARY',
      sourceSlug: 'creator-hearing',
      sourceFamily: 'claims_public',
      deskLane: 'voices',
      stateChangeType: 'commentary_item',
      clusterKeys: { committee_meeting: '119-house-117001' },
      displayPriority: 84,
    });

    const out = promoteGlobally([creator, primary], { limit: 1 })[0]!;
    expect(out.representativeId).toBe('hearing-primary');
    expect(out.decision.reasons).toContain('agenda_pulse');
    expect(out.decision.contributions.some((c) => c.message === 'Creator signal corroborated by primary record')).toBe(true);

    vi.useRealTimers();
  });

  it('D. ranks an upcoming hearing with witnesses above a generic bill filing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'));

    const hearing = mkIntel({
      id: 'hearing',
      title: 'Hearing on surveillance authority with witnesses scheduled',
      stateChangeType: 'witness_list_posted',
      publishedAt: '2026-04-29T10:00:00.000Z',
      structured: { public_consequence_tags: ['surveillance_privacy'] },
    });
    const bill = mkIntel({
      id: 'bill',
      title: 'H.R. 1000 introduced in House',
      stateChangeType: 'bill_action',
      publishedAt: '2026-04-27T10:00:00.000Z',
    });

    expect(computeAgendaPulseScore(hearing).score).toBeGreaterThan(computeAgendaPulseScore(bill).score);
    vi.useRealTimers();
  });

  it('E. ranks a public-consequence bill above routine congressional churn', () => {
    const detentionBill = mkIntel({
      id: 'detention-bill',
      title: 'Bill expands oversight of civil confinement and detention facilities',
      stateChangeType: 'bill_action',
      structured: { public_consequence_tags: ['civil_confinement', 'carceral_infrastructure'] },
    });
    const routine = mkIntel({
      id: 'routine',
      title: 'Bill names a post office and congratulates a local team',
      stateChangeType: 'bill_action',
      structured: { public_consequence_tags: [] },
    });

    expect(computeAgendaPulseScore(detentionBill).score).toBeGreaterThan(computeAgendaPulseScore(routine).score);
  });

  it('F. gives House roll-call votes strong primary action scoring', () => {
    const vote = mkIntel({
      id: 'vote',
      title: 'House roll-call vote recorded on surveillance authority',
      stateChangeType: 'house_roll_call_vote',
      structured: { public_consequence_tags: ['surveillance_privacy'] },
    });

    const score = computeAgendaPulseScore(vote);
    expect(score.score).toBeGreaterThanOrEqual(68);
    expect(score.explanations.some((e) => e.message === 'House roll-call vote recorded')).toBe(true);
  });

  it('G. treats CRS reports as context below active hearings unless consequence and freshness justify it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'));

    const crs = mkIntel({
      id: 'crs',
      title: 'CRS report: Background on surveillance authority',
      stateChangeType: 'crs_report',
      structured: { public_consequence_tags: ['surveillance_privacy'] },
      publishedAt: '2026-04-27T09:00:00.000Z',
    });
    const hearing = mkIntel({
      id: 'active-hearing',
      title: 'Committee hearing on surveillance authority scheduled',
      stateChangeType: 'committee_meeting',
      structured: { public_consequence_tags: ['surveillance_privacy'] },
      publishedAt: '2026-04-28T10:00:00.000Z',
    });

    expect(computeAgendaPulseScore(hearing).score).toBeGreaterThan(computeAgendaPulseScore(crs).score);
    vi.useRealTimers();
  });

  it('H. gives undercovered high-impact primary items an undercovered boost', () => {
    const primary = mkIntel({
      id: 'undercovered',
      title: 'Committee markup on civil confinement detention infrastructure',
      stateChangeType: 'committee_markup',
      structured: { public_consequence_tags: ['civil_confinement', 'carceral_infrastructure'] },
    });

    const score = computeAgendaPulseScore({ items: [primary] });
    expect(score.explanations.some((e) => e.message === 'Undercovered primary-source item')).toBe(true);
  });
});

describe('homepage Agenda Pulse mix', () => {
  it('A. lets a saturation story be hero without monopolizing all slots when high Agenda Pulse item exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'));

    const wires = ['ap', 'reuters', 'nyt', 'cnn', 'nbc'].map((source, index) => ({
      kind: 'newswire' as const,
      briefLane: 'newswire' as const,
      briefingOrigin: 'newswire' as const,
      rawScore: 95 - index,
      weightedScore: (95 - index) * BRIEFING_LANE_WEIGHT.newswire,
      story: {
        id: `wire-${index}`,
        url: `https://wire.test/whca-shooting-${index}`,
        title: 'WHCA shooting investigation updates dominate national coverage',
        excerpt: 'Large mainstream saturation story with many updates.',
        sourceSlug: source,
        publishedAt: '2026-04-27T11:00:00.000Z',
      },
    }));
    const agenda = candidate(
      mkIntel({
        id: 'agenda',
        title: 'Committee markup on detention infrastructure scheduled with witness documents',
        stateChangeType: 'committee_markup',
        publishedAt: '2026-04-28T15:00:00.000Z',
        structured: { public_consequence_tags: ['carceral_infrastructure', 'civil_confinement'] },
        displayPriority: 67,
      }),
      67,
      'lane_backstop',
    );

    const out = mergeAndRankBriefingCandidates([...wires, agenda]);
    expect(out[0].kind).toBe('newswire');
    expect(out.some((entry) => entry.kind === 'intel' && entry.intelItem.id === 'agenda')).toBe(true);
    expect(out.filter((entry) => entry.kind === 'newswire')).not.toHaveLength(out.length);

    vi.useRealTimers();
  });
});
