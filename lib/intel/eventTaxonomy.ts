export const EVENT_TYPES = [
  'bill_filed',
  'bill_cosponsored',
  'congress_urgency',
  'executive_action',
  'court_order',
  'injunction',
  'hearing_scheduled',
  'hearing_missed',
  'deposition_missed',
  'subpoena_issued',
  'subpoena_ignored',
  'contempt_threat',
  'watchdog_lawsuit',
  'ethics_probe',
  'resignation',
  'statement_claim',
  'official_statement',
  'vote_called',
  'vote_failed',
  'funding_exposure',
  'contradiction',
  'investigation_opened',
  'sanctions_action',
  'military_action',
  'policy_change',
  'generic_report',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Deterministic severity weighting (0..1) for global promotion.
 * Keep these explicit + tunable — do not hide behind opaque scoring.
 */
export const EVENT_SEVERITY: Record<EventType, number> = {
  injunction: 1.0,
  court_order: 0.92,
  congress_urgency: 0.84,
  contempt_threat: 0.9,
  subpoena_ignored: 0.88,
  subpoena_issued: 0.78,
  investigation_opened: 0.78,
  ethics_probe: 0.76,
  resignation: 0.74,
  executive_action: 0.72,
  sanctions_action: 0.7,
  military_action: 0.7,
  watchdog_lawsuit: 0.68,
  policy_change: 0.62,
  funding_exposure: 0.6,
  contradiction: 0.58,
  vote_failed: 0.56,
  vote_called: 0.52,
  bill_filed: 0.5,
  bill_cosponsored: 0.46,
  hearing_missed: 0.46,
  deposition_missed: 0.46,
  hearing_scheduled: 0.42,
  official_statement: 0.28,
  statement_claim: 0.22,
  generic_report: 0.3,
};

