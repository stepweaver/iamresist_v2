import type { BriefEventCandidate } from '@/lib/briefEvents/types';
import { presentBriefNote } from '@/lib/creatorNotes/briefPresentation';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Transcript offset clock — not wall-clock time of day.
 * Under one hour: MM:SS. Otherwise HH:MM:SS.
 */
export function formatTranscriptClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
  return `${pad2(minutes)}:${pad2(secs)}`;
}

export function formatTranscriptRange(
  startSeconds: number | null | undefined,
  endSeconds: number | null | undefined,
): string {
  if (startSeconds == null && endSeconds == null) return formatTranscriptClock(null);
  if (endSeconds == null || endSeconds === startSeconds) return formatTranscriptClock(startSeconds);
  return `${formatTranscriptClock(startSeconds)}–${formatTranscriptClock(endSeconds)}`;
}

export function creatorNamesLabel(event: BriefEventCandidate): string {
  const names = event.creators.map((creator) => creator.name || creator.id).filter(Boolean);
  return names.length ? names.join(', ') : 'Creator not stored';
}

export function primaryVerificationLabel(event: BriefEventCandidate): string | null {
  const preferred =
    event.verificationStatuses.find((status) => status !== 'not_applicable') || event.verificationStatuses[0];
  if (!preferred) return null;
  return String(preferred).replace(/_/g, ' ').toUpperCase();
}

export function presentEventNote(note: CreatorAtomicNote) {
  return presentBriefNote(note);
}
