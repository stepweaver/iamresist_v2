/**
 * Shadow-eval thresholds for Jev headline pair classification.
 * These do not affect /brief clustering or ranking.
 * Calibrate JEV_SAME_EVENT_JOIN_THRESHOLD from labeled eval results
 * before any later milestone is allowed to join clusters.
 */

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
  'Classify the relationship between these two published items. Judge the primary event or development being discussed, not merely whether they concern the same person, institution, or broad political subject.';

export const JEV_RELATION_CRITERIA = {
  same_event:
    'Both items primarily concern the same specific event, action, decision, announcement, report, filing, statement, or developing occurrence.',
  same_broader_topic:
    'The items concern the same broader issue, person, policy, investigation, or ongoing story, but primarily describe different developments.',
  different: 'The items primarily concern different events and subjects.',
  unclear: 'The title and description do not contain enough information to classify the relationship reliably.',
} as const;
