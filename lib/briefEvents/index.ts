export type { BriefEventCandidate, BriefEventDay, BriefEventsCorpus } from '@/lib/briefEvents/types';
export {
  BRIEF_EVENT_ANALYSIS_ATTACH_SECONDS,
  BRIEF_EVENT_TIME_PROXIMITY_SECONDS,
  collectAndClusterBriefNotes,
  isEligibleBriefEventNote,
  shouldGroupBriefNotes,
} from '@/lib/briefEvents/group';
export {
  composeDiscrepancyHeadline,
  headlineLooksLikeUnsupportedCoverup,
  selectBriefEventHeadline,
} from '@/lib/briefEvents/headline';
export {
  buildBriefEventCandidate,
  buildBriefEventsCorpus,
  groupBriefEventsByDay,
} from '@/lib/briefEvents/presentation';
export {
  creatorNamesLabel,
  formatTranscriptClock,
  formatTranscriptRange,
  presentEventNote,
  primaryVerificationLabel,
} from '@/lib/briefEvents/format';
export { identityFromAtomicNote, notesShouldGroup, shareCasualtyTopic } from '@/lib/briefEvents/identity';
