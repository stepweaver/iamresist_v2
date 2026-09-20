import {
  creatorNotesWindowBatchMaxInputChars,
  creatorNotesWindowBatchSize,
} from '@/lib/creatorNotes/constants';
import type {
  CreatorNotesWindowBatchDiagnostics,
  CreatorTranscriptChunk,
} from '@/lib/creatorNotes/types';

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

export function selectEvidenceWindows(
  windows: CreatorTranscriptChunk[],
  opts: { offset?: number | null; maxWindows?: number | null } = {},
): CreatorTranscriptChunk[] {
  const offsetRaw = opts.offset;
  const offset =
    offsetRaw != null && Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const sliced = offset > 0 ? windows.slice(offset) : windows;
  const maxRaw = opts.maxWindows;
  if (maxRaw != null && Number.isFinite(maxRaw) && maxRaw >= 0) {
    return sliced.slice(0, Math.floor(maxRaw));
  }
  return sliced;
}

export function emptyWindowBatchDiagnostics(
  submittedWindowIds: string[] = [],
): CreatorNotesWindowBatchDiagnostics {
  return {
    submittedWindowIds: [...submittedWindowIds],
    returnedWindowIds: [],
    missingWindowIds: [...submittedWindowIds],
    malformedWindowIds: [],
    unexpectedWindowIds: [],
    duplicateWindowIds: [],
    validationFailuresByWindow: {},
    acceptedWindowIds: [],
    repairedWindowIds: [],
    fallbackReasons: {},
  };
}

export function assessWindowBatchCoverage(input: {
  submittedWindowIds: string[];
  returnedWindowIds: string[];
  malformedWindowIds?: string[];
  unexpectedWindowIds?: string[];
  duplicateWindowIds?: string[];
  validationFailuresByWindow?: Record<string, string[]>;
}): CreatorNotesWindowBatchDiagnostics {
  const submittedWindowIds = input.submittedWindowIds.filter(Boolean);
  const returnedWindowIds = [...new Set(input.returnedWindowIds.filter((id) => submittedWindowIds.includes(id)))];
  const malformedWindowIds = [...new Set((input.malformedWindowIds || []).filter(Boolean))];
  const malformedKnown = new Set(malformedWindowIds.filter((id) => submittedWindowIds.includes(id)));
  const returnedSet = new Set(returnedWindowIds);
  const missingWindowIds = submittedWindowIds.filter((id) => !returnedSet.has(id) && !malformedKnown.has(id));
  return {
    submittedWindowIds,
    returnedWindowIds,
    missingWindowIds,
    malformedWindowIds,
    unexpectedWindowIds: [...new Set(input.unexpectedWindowIds || [])],
    duplicateWindowIds: [...new Set(input.duplicateWindowIds || [])],
    validationFailuresByWindow: { ...(input.validationFailuresByWindow || {}) },
    acceptedWindowIds: [...returnedWindowIds],
    repairedWindowIds: [],
    fallbackReasons: {},
  };
}

export function windowBatchRepairIds(diagnostics: CreatorNotesWindowBatchDiagnostics): string[] {
  const knownMalformed = diagnostics.malformedWindowIds.filter((id) =>
    diagnostics.submittedWindowIds.includes(id),
  );
  return [...new Set([...diagnostics.missingWindowIds, ...knownMalformed])];
}
