import { describe, expect, it } from 'vitest';
import { classifyEvent } from '@/lib/intel/eventClassification';

describe('classifyEvent', () => {
  it('classifies injunction/TRO as injunction', () => {
    const out = classifyEvent({
      title: 'Judge issues preliminary injunction blocking rule',
      summary: null,
      deskLane: 'osint',
      stateChangeType: 'unknown',
      clusterKeys: {},
      missionTags: ['courts'],
      provenanceClass: 'SPECIALIST',
      trustWarningMode: 'none',
      institutionalArea: 'courts',
    });
    expect(out.eventType).toBe('injunction');
  });

  it('classifies subpoena ignored when refusal language is present', () => {
    const out = classifyEvent({
      title: 'Subpoena ignored: official refuses to comply',
      summary: null,
      deskLane: 'watchdogs',
      stateChangeType: 'unknown',
      clusterKeys: {},
      missionTags: [],
      provenanceClass: 'INDIE',
      trustWarningMode: 'none',
      institutionalArea: 'unknown',
    });
    expect(out.eventType).toBe('subpoena_ignored');
  });

  it('classifies FISA reauthorization floor-vote pressure as congress_urgency', () => {
    const out = classifyEvent({
      title: 'Senate leaders scramble for late-night floor vote on FISA Section 702 reauthorization',
      summary: 'Surveillance extension and cloture fight intensify',
      deskLane: 'osint',
      stateChangeType: 'unknown',
      clusterKeys: {},
      missionTags: ['congress', 'civil_liberties'],
      provenanceClass: 'PRIMARY',
      trustWarningMode: 'none',
      institutionalArea: 'congress',
    });
    expect(out.eventType).toBe('congress_urgency');
  });

  it('classifies statement-like sources as statement_claim by default', () => {
    const out = classifyEvent({
      title: 'Spokesperson says the report is false',
      summary: null,
      deskLane: 'statements',
      stateChangeType: 'press_statement',
      clusterKeys: {},
      missionTags: ['elections'],
      provenanceClass: 'PRIMARY',
      trustWarningMode: 'source_controlled_official_claims',
      institutionalArea: 'white_house',
    });
    expect(out.eventType).toBe('statement_claim');
  });
});

