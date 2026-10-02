import { JEV_EVENT_IDENTITY_RELATIONS } from '@/lib/jev/constants';
import type { JevChoiceQuestion, JevNoulQuestion, NoteJudgmentState } from '@/lib/jev/types';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';

export const SAME_EVENT_QUESTION_KEY = 'same_event';
export const EVENT_IDENTITY_QUESTION_KEY = 'event_identity';
export const BEST_CANDIDATE_QUESTION_KEY = 'best_candidate';
export const NEW_EVENT_CHOICE = 'new_event';

export function noteJudgmentState(
  note: Pick<CreatorAtomicNote, 'kind' | 'text' | 'exactQuote' | 'sourceQuote' | 'sourceExcerpt'>,
): NoteJudgmentState {
  const evidence = String(note.exactQuote || note.sourceQuote || note.sourceExcerpt || '').trim();
  return {
    kind: String(note.kind || '').trim(),
    text: String(note.text || '').trim(),
    evidence,
  };
}

export function pairDecisionState(note: NoteJudgmentState, candidate: NoteJudgmentState): {
  note: NoteJudgmentState;
  candidate: NoteJudgmentState;
} {
  return { note, candidate };
}

const EVENT_THREAD_KIND_GUIDE =
  'Each note includes its kind so an event or new_development can be distinguished from a claim, evidence_reference, creator_analysis, or why_it_matters note.';

const EVENT_THREAD_PROXIMITY_LIMIT =
  'Do not treat notes as the same Event Thread merely because they occur near one another in a transcript.';

export function sameEventNoulQuestion(): JevNoulQuestion {
  return {
    type: 'noul',
    instructions: `Should these Atomic Notes attach to the same concrete Event Thread? ${EVENT_THREAD_KIND_GUIDE} ${EVENT_THREAD_PROXIMITY_LIMIT}`,
    criteria: {
      true: 'The notes concern the same concrete occurrence or development. This includes a creator_analysis note that directly analyzes that event, a why_it_matters note that explains that event, evidence concerning that event, a direct claim about that event, or an immediate consequence or implication. The notes do not need to state the same proposition.',
      false: 'They concern different concrete occurrences or developments, even if they share a broader topic, conflict, actor, or theme.',
    },
  };
}

export function eventIdentityChoiceQuestion(): JevChoiceQuestion {
  return {
    type: 'choice',
    instructions: `What is the Event Thread relationship between these two Atomic Notes? ${EVENT_THREAD_KIND_GUIDE} ${EVENT_THREAD_PROXIMITY_LIMIT}`,
    criteria: {
      same_event:
        'They should attach to the same concrete Event Thread. They concern the same concrete occurrence or development, including when one note is the event fact, a direct claim, evidence, creator_analysis of that event, why_it_matters analysis of that event, or an immediate consequence or implication. They do not need to state the same proposition.',
      related_but_distinct:
        'They belong to the same larger story, conflict, topic, or theme, but concern different concrete occurrences or developments and should not share one Event Thread. Merely sharing a topic or actors remains related_but_distinct.',
      unrelated: 'They are not the same occurrence and are not meaningfully related as events.',
      uncertain: 'The notes do not provide enough information to decide whether they belong on the same concrete Event Thread.',
    },
  };
}

export function pairQuestions(): {
  same_event: JevNoulQuestion;
  event_identity: JevChoiceQuestion;
} {
  return {
    [SAME_EVENT_QUESTION_KEY]: sameEventNoulQuestion(),
    [EVENT_IDENTITY_QUESTION_KEY]: eventIdentityChoiceQuestion(),
  };
}

export function candidateChoiceQuestion(candidateIds: readonly string[]): JevChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const id of candidateIds) {
    criteria[id] =
      'This candidate should attach to the same concrete Event Thread as the note. It concerns the same occurrence, or it directly analyzes, explains, supports, or states the significance of that occurrence.';
  }
  criteria[NEW_EVENT_CHOICE] =
    'None of the candidates should share the note\'s concrete Event Thread. They concern different occurrences, even if they share a broader topic, conflict, actor, or theme.';
  return {
    type: 'choice',
    instructions: `Which candidate should attach to the same concrete Event Thread as the note, or is this a new event? ${EVENT_THREAD_KIND_GUIDE} ${EVENT_THREAD_PROXIMITY_LIMIT}`,
    criteria,
  };
}

export function candidateChoiceState(
  note: NoteJudgmentState,
  candidates: Array<{ id: string; kind: string; text: string; evidence: string }>,
): { note: NoteJudgmentState; candidates: Array<{ id: string; kind: string; text: string; evidence: string }> } {
  return {
    note,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      text: candidate.text,
      evidence: candidate.evidence,
    })),
  };
}

export function isEventIdentityRelation(value: string): boolean {
  return (JEV_EVENT_IDENTITY_RELATIONS as readonly string[]).includes(value);
}
