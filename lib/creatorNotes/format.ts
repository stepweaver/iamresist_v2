import type { CreatorAtomicNote, CreatorNotesExtractArgs, CreatorNotesRunResult } from '@/lib/creatorNotes/types';

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

export function parseCreatorNotesExtractArgs(argv: string[]): CreatorNotesExtractArgs {
  const sourceItemId = argValue(argv, '--source-item');
  const transcriptFile = argValue(argv, '--transcript-file');
  if (!sourceItemId) {
    throw new Error('Missing --source-item <id>');
  }
  if (!transcriptFile) {
    throw new Error('Missing --transcript-file <path>');
  }
  return {
    sourceItemId: sourceItemId.trim(),
    transcriptFile: transcriptFile.trim(),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    limitNotes: parseLimitNotes(argv),
    json: argv.includes('--json'),
  };
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

export function formatNotePreview(note: CreatorAtomicNote): string {
  const who = note.attribution || '—';
  const lines = [`${formatNoteTimestamp(note.startSeconds)} ${kindLabel(note.kind)} — ${who}`, note.text];
  if (note.eventFeatures) {
    lines.push('');
    if (note.eventFeatures.actors.length) lines.push(`  actors: ${featureList(note.eventFeatures.actors)}`);
    if (note.eventFeatures.action) lines.push(`  action: ${note.eventFeatures.action}`);
    if (note.eventFeatures.object) lines.push(`  object: ${note.eventFeatures.object}`);
    if (note.eventFeatures.institutions.length) {
      lines.push(`  institutions: ${featureList(note.eventFeatures.institutions)}`);
    }
    if (note.eventFeatures.locations.length) lines.push(`  locations: ${featureList(note.eventFeatures.locations)}`);
    if (note.eventFeatures.referencedDocuments.length) {
      lines.push(`  documents: ${featureList(note.eventFeatures.referencedDocuments)}`);
    }
  }
  return lines.join('\n');
}

export function formatCreatorNotesReport(result: CreatorNotesRunResult): string {
  const lines = [
    'Atomic Creator Notes',
    '====================',
    '',
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
  ];

  if (result.notes.length) {
    lines.push('', 'Preview:');
    for (const note of result.notes) {
      lines.push('', formatNotePreview(note));
    }
  }

  return lines.join('\n');
}
