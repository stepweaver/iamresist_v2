import type { CreatorNoteKind, VerificationStatus } from '@/lib/creatorNotes/constants';
import type { StatementRole } from '@/lib/creatorNotes/semanticFidelity';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';

/**
 * Future event-centric brief lanes. Orthogonal to verification status.
 * Kind is structural; verification is separate; statement role is attribution.
 */
export type BriefEpistemicLane =
  | 'fact_event'
  | 'creator_analysis'
  | 'hypothesis_inference'
  | 'evidence'
  | 'verification';

export type BriefNotePresentation = {
  kind: CreatorNoteKind;
  kindLabel: string;
  lane: BriefEpistemicLane;
  displayText: string;
  verificationStatus: VerificationStatus | null;
  verificationLabel: string | null;
  statementRole: StatementRole | null;
  /** Shown only when useful (quoted / reported). Null for routine creator/unknown. */
  statementRoleLabel: string | null;
  /** Attribution cue for genuine interpretation — never a verification claim. */
  interpretationAttribution: string | null;
  /** Machine-readable markers for future event-thread grouping. */
  dataAttrs: {
    noteKind: CreatorNoteKind;
    statementRole: StatementRole | 'unknown';
    verificationStatus: VerificationStatus | 'unset';
    briefLane: BriefEpistemicLane;
  };
};

const FORBIDDEN_UI_HEDGES = [
  'editorial opinion, not established fact',
  'not established fact',
  'the transcript says',
  'the creator claims',
  'the creator believes',
  'source-derived, not established fact',
];

function titleCaseRole(role: string): string {
  return String(role || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function briefKindLabel(kind: CreatorNoteKind | string | null | undefined): string {
  return String(kind || '')
    .replace(/_/g, ' ')
    .toUpperCase();
}

export function briefVerificationLabel(
  status: VerificationStatus | string | null | undefined,
): string | null {
  if (!status) return null;
  return String(status).replace(/_/g, ' ').toUpperCase();
}

/**
 * Note kind → structural lane for a future event-centric brief.
 * Does not encode verification; claim/event are still fact_event lane.
 */
export function briefLaneForKind(kind: CreatorNoteKind | string | null | undefined): BriefEpistemicLane {
  switch (kind) {
    case 'creator_analysis':
      return 'creator_analysis';
    case 'why_it_matters':
      return 'hypothesis_inference';
    case 'evidence_reference':
      return 'evidence';
    case 'event':
    case 'claim':
    case 'new_development':
    case 'context':
    default:
      return 'fact_event';
  }
}

function normalizeStatementRole(value: unknown): StatementRole | null {
  if (value === 'creator' || value === 'quoted_speaker' || value === 'reported' || value === 'unknown') {
    return value;
  }
  return null;
}

export function briefStatementRole(
  note: Pick<CreatorAtomicNote, 'statementRole' | 'quotedSpeaker' | 'referencedSource' | 'kind' | 'attribution'>,
): StatementRole | null {
  const direct = normalizeStatementRole(note.statementRole);
  if (direct) return direct;
  if (note.quotedSpeaker) return 'quoted_speaker';
  if (note.referencedSource) return 'reported';
  return null;
}

/**
 * Display statement role only when it clarifies attribution
 * (quoted speaker or reported third party). Skip creator/unknown clutter.
 */
export function briefStatementRoleLabel(
  note: Pick<
    CreatorAtomicNote,
    'statementRole' | 'quotedSpeaker' | 'referencedSource' | 'attribution' | 'kind'
  >,
): string | null {
  const role = briefStatementRole(note);
  if (role === 'quoted_speaker') {
    const who = String(note.quotedSpeaker || '').trim();
    return who ? `Quoted speaker · ${who}` : 'Quoted speaker';
  }
  if (role === 'reported') {
    const source = String(note.referencedSource || '').trim();
    return source ? `Reported · ${source}` : 'Reported third party';
  }
  return null;
}

/**
 * Present the stored proposition as-is.
 * Never wrap with "the creator claims", "the transcript says", or similar UI hedges.
 */
export function briefDisplayText(note: Pick<CreatorAtomicNote, 'text'>): string {
  return String(note.text || '').trim();
}

function textAlreadyNamesAttribution(text: string, attribution: string): boolean {
  const hay = text.toLowerCase();
  const needle = attribution.trim().toLowerCase();
  if (!needle || needle.length < 2) return false;
  if (hay.includes(needle)) return true;
  const first = needle.split(/\s+/)[0];
  return Boolean(first && first.length >= 3 && hay.includes(first));
}

/**
 * For genuine creator interpretation, surface who is interpreting —
 * without rewriting the proposition or claiming verification.
 * Quoted/reported speech must not be labeled as the creator's voice.
 */
export function briefInterpretationAttribution(
  note: Pick<
    CreatorAtomicNote,
    'kind' | 'attribution' | 'statementRole' | 'quotedSpeaker' | 'referencedSource' | 'text'
  >,
): string | null {
  const role = briefStatementRole(note);
  if (role === 'quoted_speaker' || role === 'reported') return null;
  if (note.kind !== 'creator_analysis' && note.kind !== 'why_it_matters') return null;
  const who = String(note.attribution || '').trim();
  if (!who) return null;
  if (/^the speaker$/i.test(who)) return null;
  if (textAlreadyNamesAttribution(String(note.text || ''), who)) return null;
  return who;
}

/** Kind glosses that conflate category with epistemology — must never appear in UI. */
export function briefForbiddenEpistemicPhrases(): readonly string[] {
  return FORBIDDEN_UI_HEDGES;
}

export function presentBriefNote(
  note: Pick<
    CreatorAtomicNote,
    | 'kind'
    | 'text'
    | 'attribution'
    | 'verificationStatus'
    | 'statementRole'
    | 'quotedSpeaker'
    | 'referencedSource'
  >,
): BriefNotePresentation {
  const kind = note.kind;
  const role = briefStatementRole(note) || 'unknown';
  const verificationStatus = (note.verificationStatus || null) as VerificationStatus | null;
  const lane = briefLaneForKind(kind);

  return {
    kind,
    kindLabel: briefKindLabel(kind),
    lane,
    displayText: briefDisplayText(note),
    verificationStatus,
    verificationLabel: briefVerificationLabel(verificationStatus),
    statementRole: role === 'unknown' ? null : role,
    statementRoleLabel: briefStatementRoleLabel(note),
    interpretationAttribution: briefInterpretationAttribution(note),
    dataAttrs: {
      noteKind: kind,
      statementRole: role,
      verificationStatus: verificationStatus || 'unset',
      briefLane: lane,
    },
  };
}

export function briefContentRoleLabel(
  contentRole: CreatorAtomicNote['contentRole'] | null | undefined,
): string | null {
  if (!contentRole || contentRole === 'editorial') return null;
  return titleCaseRole(contentRole);
}
