import { describe, expect, it } from 'vitest';

import {
  NEW_EVENT_CHOICE,
  candidateChoiceQuestion,
  candidateChoiceState,
  eventIdentityChoiceQuestion,
  noteJudgmentState,
  pairDecisionState,
  pairQuestions,
  sameEventNoulQuestion,
} from '@/lib/jev/questions';
import { makeNote } from '../eventThreads/helpers';

describe('Jev milestone 1 questions', () => {
  it('asks whether notes belong on the same concrete Event Thread', () => {
    const questions = pairQuestions();
    expect(Object.keys(questions)).toEqual(['same_event', 'event_identity']);
    const noul = sameEventNoulQuestion();
    expect(noul.type).toBe('noul');
    expect(noul.instructions).toMatch(/same concrete Event Thread/i);
    expect(noul.criteria.true).toMatch(/creator_analysis/);
    expect(noul.criteria.true).toMatch(/why_it_matters/);
    expect(noul.criteria.true).toMatch(/do not need to state the same proposition/i);
    expect(noul.criteria.false).toMatch(/different concrete occurrences/i);
    expect(noul.criteria.false).toMatch(/topic/);
    expect(noul.criteria.false).toMatch(/actor/);
    const identity = eventIdentityChoiceQuestion();
    expect(Object.keys(identity.criteria)).toEqual([
      'same_event',
      'related_but_distinct',
      'unrelated',
      'uncertain',
    ]);
    expect(identity.criteria.same_event).toMatch(/creator_analysis/);
    expect(identity.criteria.same_event).toMatch(/why_it_matters/);
    expect(identity.criteria.related_but_distinct).toMatch(/different concrete occurrences/i);
    expect(identity.criteria.related_but_distinct).toMatch(/topic or actors/i);
    const blob = JSON.stringify(questions);
    expect(blob).toMatch(/near one another in a transcript/i);
    expect(blob).not.toMatch(/classify the note kind|theme membership|ranking signal/i);
  });

  it('sends kind, text, and evidence for a pair', () => {
    const note = makeNote({
      kind: 'event',
      text: 'Russia launched missiles toward Estonia.',
      exactQuote: 'Russia launched missiles toward Estonia.',
      sourceExcerpt: 'A long surrounding transcript that must stay out of the state.',
    });
    const candidate = makeNote({
      kind: 'claim',
      text: 'Estonia reported missile launches from Russia.',
      sourceQuote: 'Estonia reported missile launches from Russia.',
    });
    const state = pairDecisionState(noteJudgmentState(note), noteJudgmentState(candidate));
    expect(Object.keys(state)).toEqual(['note', 'candidate']);
    expect(Object.keys(state.note)).toEqual(['kind', 'text', 'evidence']);
    expect(state.note.kind).toBe('event');
    expect(state.candidate.kind).toBe('claim');
    expect(state.note.evidence).toBe('Russia launched missiles toward Estonia.');
    expect(JSON.stringify(state)).not.toContain('surrounding transcript');
  });

  it('limits the candidate choice to the Jev set plus new_event', () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const question = candidateChoiceQuestion(ids);
    expect(Object.keys(question.criteria)).toEqual([...ids, NEW_EVENT_CHOICE]);
    const state = candidateChoiceState(
      { kind: 'event', text: 'Note', evidence: 'Quote' },
      ids.map((id) => ({ id, kind: 'creator_analysis', text: id, evidence: id })),
    );
    expect(state.candidates).toHaveLength(5);
    expect(state.candidates[0]?.kind).toBe('creator_analysis');
    expect(question.instructions).toMatch(/same concrete Event Thread/i);
    expect(question.instructions).toMatch(/near one another in a transcript/i);
    expect(JSON.stringify(state)).not.toContain('c6');
  });
});
