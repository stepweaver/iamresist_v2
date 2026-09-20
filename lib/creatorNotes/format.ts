import {
  CREATOR_NOTE_KINDS,
  CREATOR_NOTES_BATCH_DEFAULT_LIMIT,
  CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS,
  CREATOR_NOTES_REVIEW_DEFAULT_LIMIT,
  CREATOR_NOTES_REVIEW_HARD_MAX,
} from '@/lib/creatorNotes/constants';
import { clampCreatorNotesBatchLimit, clampCreatorNotesSinceHours } from '@/lib/creatorNotes/select';
import type {
  CreatorAtomicNote,
  CreatorNoteKind,
  CreatorNotesBatchArgs,
  CreatorNotesBatchResult,
  CreatorNotesExtractArgs,
  CreatorNotesPodcastExtractArgs,
  CreatorNotesReviewArgs,
  CreatorNotesReviewResult,
  CreatorNotesRunResult,
  CreatorNotesSourcesArgs,
  CreatorNotesPodcastSourcesArgs,
  PodcastSourceListRow,
  PodcastFeedsDiagnosticReport,
  CreatorNotesPodcastBatchResult,
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

function parsePositiveInt(raw: string | null, flag: string): number | null {
  if (raw == null) return null;
  if (raw === '' || !/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Number(raw);
}

function parseKindFlag(raw: string | null): CreatorNoteKind | null {
  if (raw == null) return null;
  const kind = raw.trim();
  if (!kind) throw new Error('Missing --kind <kind>');
  if (!CREATOR_NOTE_KINDS.includes(kind as CreatorNoteKind)) {
    throw new Error(`--kind must be one of: ${CREATOR_NOTE_KINDS.join(', ')}`);
  }
  return kind as CreatorNoteKind;
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

export function parseCreatorNotesPodcastSourcesArgs(argv: string[]): CreatorNotesPodcastSourcesArgs {
  return parseCreatorNotesSourcesArgs(argv);
}

export function parseCreatorNotesPodcastExtractArgs(argv: string[]): CreatorNotesPodcastExtractArgs {
  const sourceItemId = argValue(argv, '--source-item');
  if (!sourceItemId) {
    throw new Error('Missing --source-item <id>');
  }
  return {
    sourceItemId: sourceItemId.trim(),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    limitNotes: parseLimitNotes(argv),
    json: argv.includes('--json'),
    creatorName: parseOptionalFlag(argv, '--creator-name'),
    sourceTitle: parseOptionalFlag(argv, '--source-title'),
    sourceUrl: parseOptionalFlag(argv, '--source-url'),
    transcribeAudio: argv.includes('--transcribe-audio'),
  };
}

export function parseCreatorNotesBatchArgs(argv: string[]): CreatorNotesBatchArgs {
  const limitRaw = parsePositiveInt(argValue(argv, '--limit'), '--limit');
  const sinceRaw = parsePositiveInt(argValue(argv, '--since-hours'), '--since-hours');
  return {
    limit: clampCreatorNotesBatchLimit(limitRaw ?? CREATOR_NOTES_BATCH_DEFAULT_LIMIT),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    creator: parseOptionalFlag(argv, '--creator'),
    sinceHours: clampCreatorNotesSinceHours(sinceRaw ?? CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS),
    json: argv.includes('--json'),
  };
}

export function parseCreatorNotesReviewArgs(argv: string[]): CreatorNotesReviewArgs {
  const limitRaw = parsePositiveInt(argValue(argv, '--limit'), '--limit');
  const sinceRaw = parsePositiveInt(argValue(argv, '--since-hours'), '--since-hours');
  const limit = limitRaw ?? CREATOR_NOTES_REVIEW_DEFAULT_LIMIT;
  return {
    limit: Math.max(1, Math.min(CREATOR_NOTES_REVIEW_HARD_MAX, limit)),
    creator: parseOptionalFlag(argv, '--creator'),
    kind: parseKindFlag(argValue(argv, '--kind')),
    sinceHours: sinceRaw,
    sourceItemId: parseOptionalFlag(argv, '--source-item'),
    json: argv.includes('--json'),
  };
}

function formatDurationCovered(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  return `${Math.round(seconds)}s`;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function formatTranscriptSection(acquisition: TranscriptAcquisitionDiagnostics): string {
  const lines = [
    'Transcript:',
    `  source: ${acquisition.source}`,
    `  language: ${acquisition.language || 'unknown'}`,
    `  generated: ${acquisition.generated}`,
    `  raw segments: ${acquisition.rawSegments}`,
    `  normalized segments: ${acquisition.normalizedSegments}`,
    `  duration covered: ${formatDurationCovered(acquisition.durationCoveredSeconds)}`,
    `  characters: ${acquisition.characters}`,
  ];
  if (acquisition.transcriptUrl) lines.push(`  transcript URL: ${acquisition.transcriptUrl}`);
  if (acquisition.transcriptMimeType) lines.push(`  transcript mime: ${acquisition.transcriptMimeType}`);
  if (acquisition.transcriptLanguage && acquisition.transcriptLanguage !== acquisition.language) {
    lines.push(`  transcript language: ${acquisition.transcriptLanguage}`);
  }
  if (acquisition.audioUrl) lines.push(`  audio URL: ${acquisition.audioUrl}`);
  if (acquisition.transcriptionProvider) {
    lines.push(`  transcription provider: ${acquisition.transcriptionProvider}`);
  }
  if (acquisition.transcriptionModel) lines.push(`  transcription model: ${acquisition.transcriptionModel}`);
  if (acquisition.transcriptionVersion) {
    lines.push(`  transcription version: ${acquisition.transcriptionVersion}`);
  }
  if (acquisition.source === 'local_audio_transcription') {
    if (acquisition.cacheHit) lines.push('  cache: hit');
    else if (acquisition.cacheHit === false) lines.push('  cache: miss');
  }
  if (acquisition.timings) {
    lines.push(`  audio download: ${formatDurationMs(acquisition.timings.audioDownloadMs)}`);
    lines.push(`  transcription: ${formatDurationMs(acquisition.timings.transcriptionMs)}`);
    lines.push(`  Atomic Notes extraction: ${formatDurationMs(acquisition.timings.extractionMs)}`);
    lines.push(`  total: ${formatDurationMs(acquisition.timings.totalMs)}`);
  }
  return lines.join('\n');
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

export function formatPodcastSourcesList(items: PodcastSourceListRow[]): string {
  if (!items.length) {
    return 'No podcast episodes found.';
  }
  const lines = [
    'Podcast source items',
    '====================',
    '',
    'ID\tcreator\tepisode title\tpublished\ttranscript discovered\ttranscript source\taudio URL',
  ];
  for (const item of items) {
    lines.push(
      [
        item.sourceItemId,
        clip(item.creatorName || item.creatorId, 40),
        clip(item.title, 80),
        item.publishedAt || '—',
        item.transcriptDiscovered ? 'yes' : 'no',
        item.transcriptSource || '—',
        item.audioUrlPresent ? 'yes' : 'no',
      ].join('\t'),
    );
  }
  return lines.join('\n');
}

export function formatPodcastFeedsReport(report: PodcastFeedsDiagnosticReport): string {
  const lines = [
    'Podcast feed discovery',
    '======================',
    '',
    `Enabled voices in registry: ${report.voicesInRegistry}`,
    `Podcast-capable sources: ${report.podcastCapableCount}`,
    `YouTube-only voices: ${report.youtubeOnlyCount}`,
    `Feeds attempted: ${report.feedsAttempted}`,
    `Feeds fetched successfully: ${report.feedsFetchedOk}`,
    `Feeds missing or failing: ${report.feedsMissingOrFailed}`,
  ];

  const capable = report.sources.filter((row) => row.podcastCapable);
  const skipped = report.sources.filter((row) => !row.podcastCapable);

  if (capable.length) {
    lines.push('', 'Podcast-capable sources', '-----------------------');
    for (const row of capable) {
      lines.push('');
      lines.push(`creator: ${row.creatorName || row.creatorId || '—'}`);
      lines.push(`slug: ${row.creatorId || '—'}`);
      lines.push(`platform: ${row.platform || '—'}`);
      lines.push(`provider: ${row.providerType}`);
      lines.push(`website: ${row.websiteUrl || '—'}`);
      lines.push(`configured feed: ${row.configuredFeedUrl || '—'}`);
      lines.push(`podcast feed: ${row.configuredPodcastFeedUrl || '—'}`);
      if (!row.feeds.length) {
        lines.push(`feeds: none (${row.skipReason || 'missing_podcast_feed'})`);
        continue;
      }
      for (const feed of row.feeds) {
        lines.push(
          [
            'feed:',
            feed.feedUrl,
            `origin=${feed.origin}`,
            `fetched=${feed.fetched ? 'yes' : 'no'}`,
            `status=${feed.status}`,
            `entries=${feed.entryCount}`,
            `audio=${feed.audioEnclosureCount}`,
            `podcast:transcript=${feed.podcastTranscriptCount}`,
            `error=${feed.error || '—'}`,
          ].join(' '),
        );
      }
    }
  } else {
    lines.push('', 'No podcast-capable sources found in the Voice registry.');
  }

  if (skipped.length) {
    lines.push('', 'Other enabled voices (not podcast-capable)', '------------------------------------------');
    for (const row of skipped) {
      lines.push(
        [
          row.creatorName || row.creatorId || '—',
          `platform=${row.platform || '—'}`,
          `provider=${row.providerType}`,
          `feed=${row.configuredFeedUrl || '—'}`,
          `podcast=${row.configuredPodcastFeedUrl || '—'}`,
          `website=${row.websiteUrl || '—'}`,
          row.skipReason || 'skipped',
        ].join(' | '),
      );
    }
  }

  return lines.join('\n');
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}

function formatClock(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${padTime(h)}:${padTime(m)}:${padTime(s)}`;
}

export function formatNoteTimestamp(seconds: number | null): string {
  return `[${formatClock(seconds)}]`;
}

export function formatNoteTimestampRange(startSeconds: number | null, endSeconds: number | null): string {
  if (startSeconds == null && endSeconds == null) return formatNoteTimestamp(null);
  if (endSeconds == null || endSeconds === startSeconds) return formatNoteTimestamp(startSeconds);
  return `[${formatClock(startSeconds)}–${formatClock(endSeconds)}]`;
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

function formatKindCountMap(counts: Record<string, number>): string {
  const keys = Object.keys(counts);
  if (!keys.length) return '(none)';
  return keys.map((key) => `${key}=${counts[key]}`).join(' ');
}

function formatEvidenceDuration(note: CreatorAtomicNote): string {
  const duration =
    note.evidenceDurationSeconds ??
    (note.startSeconds != null && note.endSeconds != null && Number.isFinite(note.startSeconds) && Number.isFinite(note.endSeconds)
      ? Math.max(0, note.endSeconds - note.startSeconds)
      : null);
  if (duration == null) return '—';
  return `${Math.round(duration)}s`;
}

export function formatNotePreview(note: CreatorAtomicNote): string {
  const who = note.attribution || '—';
  const quote = note.sourceQuote || note.exactQuote;
  const lines = [
    `${formatNoteTimestampRange(note.startSeconds, note.endSeconds)} ${kindLabel(note.kind)} — ${who}`,
    '',
    'Note:',
    note.text,
    '',
  ];
  if (quote) {
    lines.push('Source quote:', `"${quote}"`, '');
  } else {
    lines.push('Source quote: (not available)', '');
  }
  if (note.sourceExcerpt) {
    lines.push(
      'Evidence:',
      formatNoteTimestampRange(note.startSeconds, note.endSeconds),
      note.sourceExcerpt,
      '',
    );
  } else {
    lines.push('Evidence: (not available)', '');
  }
  lines.push(`Source segments: ${formatSourceSegments(note.sourceSegmentIndexes)}`);
  lines.push(`Evidence duration: ${formatEvidenceDuration(note)}`);
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
    `  evidence windows: ${result.ai.chunks}`,
    `  successful windows: ${result.ai.successfulChunks}`,
    `  failed windows: ${result.ai.failedChunks}`,
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
    `  raw kinds: ${formatKindCountMap(result.kindDiagnostics?.rawCounts || {})}`,
    `  validated kinds: ${formatKindCountMap(result.kindDiagnostics?.validatedCounts || result.kindCounts)}`,
    `  kind missing: ${result.kindDiagnostics?.missingKind ?? 0}`,
    `  kind invalid: ${result.kindDiagnostics?.invalidKind ?? 0}`,
    `  kind coercions: ${result.kindDiagnostics?.coercions ?? 0}`,
    `  notes with source evidence: ${result.evidenceDiagnostics.notesWithSourceEvidence}`,
    `  notes without source evidence: ${result.evidenceDiagnostics.notesWithoutSourceEvidence}`,
    `  invalid source segment references: ${result.evidenceDiagnostics.invalidSourceSegmentReferences}`,
    `  grounding rejected: ${result.evidenceDiagnostics.groundingRejected ?? 0}`,
    `  quote verification rejected: ${result.evidenceDiagnostics.quoteVerificationRejected ?? 0}`,
    `  unsupported numbers rejected: ${result.evidenceDiagnostics.unsupportedNumberRejected ?? 0}`,
    `  compound notes rejected: ${result.evidenceDiagnostics.compoundRejected ?? 0}`,
    `  wide evidence windows: ${result.evidenceDiagnostics.wideEvidenceWindows ?? 0}`,
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

export function formatCreatorNotesBatchReport(result: CreatorNotesBatchResult): string {
  if (result.lockBusy) {
    return `creator-notes batch already running\n${result.skipReason || ''}`.trim();
  }
  if (result.skipReason && result.items.length === 0) {
    return `Atomic Creator Notes Batch\n==========================\n\nSkipped: ${result.skipReason}`;
  }

  const s = result.summary;
  const lines = [
    'Atomic Creator Notes Batch',
    '==========================',
    '',
    `Candidate Voice items: ${s.candidateVoiceItems}`,
    `Processed: ${s.processed}`,
    `Already processed: ${s.alreadyProcessed}`,
    `No captions: ${s.noCaptions}`,
    `Failed: ${s.failed}`,
    '',
    'Caption failures:',
    `  no captions: ${s.captionFailures.no_captions}`,
    `  fetch error: ${s.captionFailures.fetch_error}`,
    `  malformed captions: ${s.captionFailures.malformed_captions}`,
    `  empty transcript: ${s.captionFailures.empty_transcript}`,
    '',
    'Transcripts:',
    `  caption tracks fetched: ${s.transcripts.captionTracksFetched}`,
    `  characters processed: ${s.transcripts.charactersProcessed}`,
    `  chunks: ${s.transcripts.chunks}`,
    '',
    'Notes:',
    `  total: ${s.notes.total}`,
    `  event: ${s.notes.event}`,
    `  claim: ${s.notes.claim}`,
    `  new_development: ${s.notes.new_development}`,
    `  context: ${s.notes.context}`,
    `  evidence_reference: ${s.notes.evidence_reference}`,
    `  creator_analysis: ${s.notes.creator_analysis}`,
    `  why_it_matters: ${s.notes.why_it_matters}`,
    '',
    'Evidence:',
    `  notes with source evidence: ${s.evidence.notesWithSourceEvidence}`,
    `  notes without source evidence: ${s.evidence.notesWithoutSourceEvidence}`,
    `  exact quotes verified: ${s.evidence.exactQuotesVerified}`,
    `  exact quotes rejected: ${s.evidence.exactQuotesRejected}`,
    '',
    'Persistence:',
    `  runs created: ${s.persistence.dryRun ? 0 : s.persistence.runsCreated}`,
    `  notes written: ${s.persistence.dryRun ? 0 : s.persistence.notesWritten}`,
    '',
    'Duration:',
    `  total: ${formatDurationMs(s.duration.totalMs)}`,
    `  average/item: ${formatDurationMs(s.duration.averagePerItemMs)}`,
  ];

  if (s.creators.length) {
    lines.push('', 'Creators:');
    for (const row of s.creators) {
      const name = String(row.creatorName || row.creatorId || 'unknown');
      const padded = name.length >= 20 ? `${name.slice(0, 19)}…` : name.padEnd(20);
      lines.push(`  ${padded} items ${row.items}   notes ${row.notes}`);
    }
  }

  if (result.summary.persistence.dryRun) {
    lines.push('', 'Dry run: yes (zero creator-note writes)');
  }

  return lines.join('\n');
}

export function formatCreatorNotesPodcastBatchReport(result: CreatorNotesPodcastBatchResult): string {
  if (result.lockBusy) {
    return `creator-notes podcast batch already running\n${result.skipReason || ''}`.trim();
  }
  if (result.skipReason && result.items.length === 0) {
    return `Atomic Creator Notes Podcast Batch\n==================================\n\nSkipped: ${result.skipReason}`;
  }
  const s = result.summary;
  const lines = [
    'Atomic Creator Notes Podcast Batch',
    '==================================',
    '',
    `Candidate episodes: ${s.candidateEpisodes}`,
    `Processed: ${s.processed}`,
    `Already processed: ${s.alreadyProcessed}`,
    `Transcript unavailable: ${s.transcriptUnavailable}`,
    `Failed: ${s.failed}`,
    '',
    'Transcript statuses:',
    `  TRANSCRIPT_AVAILABLE: ${s.transcriptStatuses.TRANSCRIPT_AVAILABLE}`,
    `  TRANSCRIPT_UNAVAILABLE: ${s.transcriptStatuses.TRANSCRIPT_UNAVAILABLE}`,
    `  TRANSCRIPT_FETCH_FAILED: ${s.transcriptStatuses.TRANSCRIPT_FETCH_FAILED}`,
    `  TRANSCRIPT_FORMAT_UNSUPPORTED: ${s.transcriptStatuses.TRANSCRIPT_FORMAT_UNSUPPORTED}`,
    `  TRANSCRIPT_PARSE_FAILED: ${s.transcriptStatuses.TRANSCRIPT_PARSE_FAILED}`,
    `  TRANSCRIPT_EMPTY: ${s.transcriptStatuses.TRANSCRIPT_EMPTY}`,
    `  AUDIO_DOWNLOAD_FAILED: ${s.transcriptStatuses.AUDIO_DOWNLOAD_FAILED}`,
    `  AUDIO_TOO_LARGE: ${s.transcriptStatuses.AUDIO_TOO_LARGE}`,
    `  AUDIO_TRANSCODE_FAILED: ${s.transcriptStatuses.AUDIO_TRANSCODE_FAILED}`,
    `  TRANSCRIPTION_FAILED: ${s.transcriptStatuses.TRANSCRIPTION_FAILED}`,
    `  TRANSCRIPTION_EMPTY: ${s.transcriptStatuses.TRANSCRIPTION_EMPTY}`,
    '',
    'Persistence:',
    `  runs created: ${s.persistence.dryRun ? 0 : s.persistence.runsCreated}`,
    `  notes written: ${s.persistence.dryRun ? 0 : s.persistence.notesWritten}`,
  ];
  if (s.persistence.dryRun) lines.push('', 'Dry run: yes (zero creator-note writes)');
  return lines.join('\n');
}

export function formatCreatorNotesReview(result: CreatorNotesReviewResult): string {
  if (!result.groups.length) {
    return 'No creator notes found.';
  }
  const blocks: string[] = [];
  for (const group of result.groups) {
    const header = [
      '==================================================',
      group.creatorName || group.creatorId || 'Unknown creator',
      group.title || group.sourceItemId,
      `published: ${group.publishedAt || '—'}`,
      `source: ${group.sourceUrl || group.sourceItemId}`,
      `run: ${group.runId || '—'}`,
      `notes: ${group.notes.length}`,
      '==================================================',
    ];
    const body = group.notes.map((note) => formatReviewNote(note)).join('\n\n');
    blocks.push([...header, '', body].join('\n'));
  }
  return blocks.join('\n\n');
}

function formatReviewNote(note: CreatorAtomicNote): string {
  const quote = note.sourceQuote || note.exactQuote;
  const lines = [
    `${formatNoteTimestampRange(note.startSeconds, note.endSeconds)} ${kindLabel(note.kind)}`,
    '',
    'Note:',
    note.text,
    '',
  ];
  if (quote) {
    lines.push('Source quote:', `"${quote}"`, '');
  }
  if (note.sourceExcerpt) {
    lines.push(
      'Evidence:',
      formatNoteTimestampRange(note.startSeconds, note.endSeconds),
      note.sourceExcerpt,
    );
  } else {
    lines.push('Evidence: (not available)');
  }
  lines.push(`Source segments: ${formatSourceSegments(note.sourceSegmentIndexes)}`);
  lines.push(`Evidence duration: ${formatEvidenceDuration(note)}`);
  return lines.join('\n');
}
