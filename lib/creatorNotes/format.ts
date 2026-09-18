import { normalizeForQuoteMatch } from '@/lib/creatorNotes/quotes';
import type {
  CreatorAtomicNote,
  CreatorNotesExtractArgs,
  CreatorNotesRunResult,
  CreatorNotesSourcesArgs,
  ResolvedCreatorSource,
  TranscriptAcquisitionDiagnostics,
} from '@/lib/creatorNotes/types';

function argValue(argv: string[], name: string): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === name) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) return '';
      return next;
    }
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return null;
}

function parseLimitNotes(argv: string[]): number | null {
  const raw = argValue(argv, '--limit-notes');
  if (raw == null) return null;
  if (!/^\d+$/.test(raw)) {
    throw new Error('--limit-notes must be a non-negative integer');
  }
  return Number(raw);
}

function parseOptionalFlag(argv: string[], name: string): string | null {
  const raw = argValue(argv, name);
  if (raw == null) return null;
  const cleaned = raw.trim();
  return cleaned || null;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

export function parseCreatorNotesExtractArgs(argv: string[]): CreatorNotesExtractArgs {
  const sourceItemId = argValue(argv, '--source-item');
  if (!sourceItemId) {
    throw new Error('Missing --source-item <id>');
  }
  const transcriptFileRaw = argValue(argv, '--transcript-file');
  if (hasFlag(argv, '--transcript-file') && !transcriptFileRaw) {
    throw new Error('Missing --transcript-file <path>');
  }
  return {
    sourceItemId: sourceItemId.trim(),
    transcriptFile: transcriptFileRaw ? transcriptFileRaw.trim() : null,
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    limitNotes: parseLimitNotes(argv),
    json: argv.includes('--json'),
    creatorName: parseOptionalFlag(argv, '--creator-name'),
    sourceTitle: parseOptionalFlag(argv, '--source-title'),
    sourceUrl: parseOptionalFlag(argv, '--source-url'),
  };
}

export function parseCreatorNotesSourcesArgs(argv: string[]): CreatorNotesSourcesArgs {
  const raw = argValue(argv, '--limit');
  if (raw == null || raw === '') {
    return { limit: 20 };
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error('--limit must be a positive integer');
  }
  return { limit: Number(raw) };
}

function formatDurationCovered(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  return `${Math.round(seconds)}s`;
}

export function formatTranscriptSection(acquisition: TranscriptAcquisitionDiagnostics): string {
  return [
    'Transcript:',
    `  source: ${acquisition.source}`,
    `  language: ${acquisition.language || 'unknown'}`,
    `  generated: ${acquisition.generated}`,
    `  raw segments: ${acquisition.rawSegments}`,
    `  normalized segments: ${acquisition.normalizedSegments}`,
    `  duration covered: ${formatDurationCovered(acquisition.durationCoveredSeconds)}`,
    `  characters: ${acquisition.characters}`,
  ].join('\n');
}

function clip(value: string | null, max: number): string {
  const text = value || '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function formatCreatorSourcesList(items: ResolvedCreatorSource[]): string {
  if (!items.length) {
    return 'No creator items found.';
  }
  const lines = [
    'Creator source items',
    '====================',
    '',
    'ID\tcreator\ttitle\tpublished\tprovider',
  ];
  for (const item of items) {
    lines.push(
      [
        item.sourceItemId,
        clip(item.creatorName || item.creatorId, 40),
        clip(item.title, 80),
        item.publishedAt || '—',
        item.provider,
      ].join('\t'),
    );
  }
  return lines.join('\n');
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatNoteTimestamp(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '[--:--:--]';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `[${padTime(h)}:${padTime(m)}:${padTime(s)}]`;
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ').toUpperCase();
}

function featureList(values: string[]): string {
  return values.length ? values.join(', ') : '—';
}

function formatSourceSegments(indexes: number[] | undefined): string {
  if (!indexes || indexes.length === 0) return '(none)';
  return indexes.join(', ');
}

function essentiallyIdenticalText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeForQuoteMatch(a).normalized === normalizeForQuoteMatch(b).normalized;
}

export function formatNotePreview(note: CreatorAtomicNote): string {
  const who = note.attribution || '—';
  const lines = [
    `${formatNoteTimestamp(note.startSeconds)} ${kindLabel(note.kind)} — ${who}`,
    '',
  ];
  if (note.sourceExcerpt) {
    lines.push('Transcript:', `"${note.sourceExcerpt}"`, '');
  } else {
    lines.push('Transcript: (not available)', '');
  }
  lines.push('Note:', note.text, '');
  if (note.exactQuote && !essentiallyIdenticalText(note.exactQuote, note.sourceExcerpt)) {
    lines.push('Exact quote:', `"${note.exactQuote}"`, '');
  }
  lines.push(`Source segments: ${formatSourceSegments(note.sourceSegmentIndexes)}`);
  if (note.eventFeatures) {
    const extra: string[] = [];
    if (note.eventFeatures.actors.length) extra.push(`  actors: ${featureList(note.eventFeatures.actors)}`);
    if (note.eventFeatures.action) extra.push(`  action: ${note.eventFeatures.action}`);
    if (note.eventFeatures.object) extra.push(`  object: ${note.eventFeatures.object}`);
    if (note.eventFeatures.institutions.length) {
      extra.push(`  institutions: ${featureList(note.eventFeatures.institutions)}`);
    }
    if (note.eventFeatures.locations.length) extra.push(`  locations: ${featureList(note.eventFeatures.locations)}`);
    if (note.eventFeatures.referencedDocuments.length) {
      extra.push(`  documents: ${featureList(note.eventFeatures.referencedDocuments)}`);
    }
    if (extra.length) {
      lines.push('', ...extra);
    }
  }
  return lines.join('\n');
}

export function formatCreatorNotesReport(result: CreatorNotesRunResult): string {
  const lines = [
    'Atomic Creator Notes',
    '====================',
    '',
  ];
  if (result.transcriptAcquisition) {
    lines.push(formatTranscriptSection(result.transcriptAcquisition), '');
  }
  lines.push(
    'Source:',
    `  source item: ${result.source.sourceItemId}`,
    `  creator: ${result.source.creatorName || result.source.creatorId || '—'}`,
    `  title: ${result.source.title || '—'}`,
    `  URL: ${result.source.url || '—'}`,
    `  transcript segments: ${result.source.transcriptSegments}`,
    `  transcript chars: ${result.source.transcriptChars}`,
    `  transcript hash: ${result.source.transcriptHash}`,
    '',
    'AI:',
    `  provider: ${result.ai.provider}`,
    `  model: ${result.ai.model}`,
    `  extraction version: ${result.ai.extractionVersion}`,
    `  chunks: ${result.ai.chunks}`,
    `  successful chunks: ${result.ai.successfulChunks}`,
    `  failed chunks: ${result.ai.failedChunks}`,
    '',
    'Notes:',
    `  total extracted: ${result.notes.length}`,
    `  event: ${result.kindCounts.event}`,
    `  claim: ${result.kindCounts.claim}`,
    `  new_development: ${result.kindCounts.new_development}`,
    `  context: ${result.kindCounts.context}`,
    `  evidence_reference: ${result.kindCounts.evidence_reference}`,
    `  creator_analysis: ${result.kindCounts.creator_analysis}`,
    `  why_it_matters: ${result.kindCounts.why_it_matters}`,
    `  validation rejected: ${result.validationRejected}`,
    `  duplicates removed: ${result.duplicatesRemoved}`,
    `  notes with source evidence: ${result.evidenceDiagnostics.notesWithSourceEvidence}`,
    `  notes without source evidence: ${result.evidenceDiagnostics.notesWithoutSourceEvidence}`,
    `  invalid source segment references: ${result.evidenceDiagnostics.invalidSourceSegmentReferences}`,
    `  exact quotes requested: ${result.evidenceDiagnostics.exactQuotesRequested}`,
    `  exact quotes verified: ${result.evidenceDiagnostics.exactQuotesVerified}`,
    `  exact quotes rejected: ${result.evidenceDiagnostics.exactQuotesRejected}`,
    '',
    'Persistence:',
    `  dry run: ${result.persistence.dryRun ? 'yes' : 'no'}`,
    `  prior equivalent run: ${
      result.persistence.dryRun
        ? 'skipped (dry-run)'
        : result.persistence.priorEquivalentRunId || '—'
    }`,
    `  run id: ${result.persistence.dryRun ? '(none)' : result.persistence.runId || '—'}`,
    `  notes written: ${result.persistence.notesWritten}`,
    `  status: ${result.persistence.status}`,
  );

  if (result.notes.length) {
    lines.push('', 'Preview:');
    for (const note of result.notes) {
      lines.push('', formatNotePreview(note));
    }
  }

  return lines.join('\n');
}
