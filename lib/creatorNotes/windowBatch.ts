import {
  creatorNotesWindowBatchMaxInputChars,
  creatorNotesWindowBatchSize,
} from '@/lib/creatorNotes/constants';
import type { CreatorTranscriptChunk } from '@/lib/creatorNotes/types';

function windowInputChars(window: CreatorTranscriptChunk): number {
  return String(window.verbatimTranscript || window.text || '').length;
}

export function packEvidenceWindowBatches(
  windows: CreatorTranscriptChunk[],
  opts: { maxWindows?: number; maxInputChars?: number } = {},
): CreatorTranscriptChunk[][] {
  const maxWindows = opts.maxWindows ?? creatorNotesWindowBatchSize();
  const maxInputChars = opts.maxInputChars ?? creatorNotesWindowBatchMaxInputChars();
  const batches: CreatorTranscriptChunk[][] = [];
  let current: CreatorTranscriptChunk[] = [];
  let currentChars = 0;

  for (const window of windows) {
    const chars = windowInputChars(window);
    const wouldExceedCount = current.length >= maxWindows;
    const wouldExceedChars = current.length > 0 && currentChars + chars > maxInputChars;
    if (wouldExceedCount || wouldExceedChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(window);
    currentChars += chars;
  }
  if (current.length) batches.push(current);
  return batches;
}
