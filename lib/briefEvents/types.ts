import type { VerificationStatus } from '@/lib/creatorNotes/constants';
import type { BriefEpisode } from '@/lib/creatorNotes/brief';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';

/**
 * Read-only Event Candidate — a presentation grouping of Atomic Notes that
 * describe the same real-world development. Not persisted.
 */
export type BriefEventCandidate = {
  id: string;
  sourceItemIds: string[];
  startSeconds: number | null;
  endSeconds: number | null;
  date: string | null;
  chronology: 'published' | 'extracted';
  headline: string;
  creators: Array<{
    id: string | null;
    name: string | null;
  }>;
  verificationStatuses: VerificationStatus[];
  notes: CreatorAtomicNote[];
  developments: CreatorAtomicNote[];
  reportedClaims: CreatorAtomicNote[];
  creatorAnalysis: CreatorAtomicNote[];
  whyItMatters: CreatorAtomicNote[];
  evidence: CreatorAtomicNote[];
  context: CreatorAtomicNote[];
  noteCount: number;
  /** Episode meta used for date grouping / debug. */
  episode: Pick<
    BriefEpisode,
    | 'sourceItemId'
    | 'creatorId'
    | 'creatorName'
    | 'title'
    | 'publishedAt'
    | 'extractedAt'
    | 'sourceUrl'
    | 'chronology'
    | 'extractionVersion'
    | 'runId'
  >;
};

export type BriefEventDay = {
  dayKey: string;
  label: string;
  chronology: 'published' | 'extracted';
  events: BriefEventCandidate[];
};

export type BriefEventsCorpus = {
  days: BriefEventDay[];
  eventCount: number;
  noteCount: number;
  /** All editorial notes that participated in Event Candidates. */
  participatingNoteIds: string[];
  /** Notes present in brief episodes but excluded from Event Candidates (non-editorial). */
  excludedNoteCount: number;
};
