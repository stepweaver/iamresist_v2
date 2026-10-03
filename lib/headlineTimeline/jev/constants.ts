import type { HeadlineRelation } from '@/lib/headlineTimeline/jev/types';

/**
 * Shadow-eval thresholds for Jev headline pair classification.
 * These do not affect /brief clustering or ranking.
 * Calibrate JEV_SAME_EVENT_JOIN_THRESHOLD from labeled eval results
 * before any later milestone is allowed to join clusters.
 */

/**
 * Eval artifact relation schema.
 * 1: same_event, same_broader_topic, different, unclear.
 * 2: same_event, same_story, related_context, different, unclear.
 * Schema 1 artifacts stay schema 1. `same_broader_topic` is not reinterpreted.
 */
export const HEADLINE_JEV_RELATION_SCHEMA_VERSION = 2;

/** Same-event probability and choice confidence both required for a proposed join. */
export const JEV_SAME_EVENT_JOIN_THRESHOLD = 0.8;

/**
 * Distinctive shared anchors required before a non-cluster pair is sent to Jev.
 * An anchor is a support token that is not broad context. See compareTitles.
 */
export const JEV_PREFILTER_MIN_SHARED_ANCHORS = 1;

export const JEV_MODEL = 'jev-latest';

export const JEV_SYSTEMONE_URL = 'https://api.typesafe.ai/v1/systemone';

export const JEV_DEFAULT_TIMEOUT_MS = 20_000;

/** Question id. It is not part of the model prompt. */
export const JEV_RELATION_QUESTION_KEY = 'relation';

export const JEV_RELATION_INSTRUCTIONS =
  'Classify the relationship between these two published items. Judge the primary occurrence or development each item discusses. A shared country, conflict, institution, person, or broad issue is not the same event and is not the same story. Do not treat all Israel/Gaza items as one story. Do not treat all Trump items as one story. Do not treat all surveillance items as one story. Do not treat all election items as one story.';

export const JEV_RELATION_CRITERIA: Record<HeadlineRelation, string> = {
  same_event:
    'Both items primarily describe, report, or directly discuss the same specific occurrence, action, decision, filing, ruling, announcement, attack, vote, statement, incident, or other discrete development. These are effectively about the same occurrence.',
  same_story:
    'The items describe different developments, reactions, consequences, follow-ups, investigations, appeals, responses, or analysis that belong to the same identifiable ongoing sequence of events. An editor maintaining one chronological story dossier would place both items in the same story thread. Examples: an attack and an airline suspending flights because of that attack; a court ruling and an appeal of that ruling; an incident and an official investigation into that incident; an incident and a political response directly caused by that incident. Shared geography or a shared conflict alone does not create this label.',
  related_context:
    'The items share a country, conflict, institution, person, policy domain, movement, broad issue, or general political context, but they are not part of the same identifiable event sequence and must not be linked into the same story timeline. Examples: Gaza hostage negotiations and West Bank settler sanctions; Gaza education restrictions and Gaza ceasefire negotiations; an election-integrity article and an unrelated election dispute; two unrelated surveillance stories; two Trump stories about different developments.',
  different:
    'The items are primarily about unrelated subjects or developments.',
  unclear:
    'The available title and description are too thin, ambiguous, generic, or clickbait-heavy to classify the relationship reliably.',
};
