import { EVENT_THREAD_RESOLUTION_TYPES, type EventThreadResolutionType } from '@/lib/eventThreads/constants';
import type { EventThreadsBuildArgs, EventThreadsBuildResult, ProposedEventThread } from '@/lib/eventThreads/types';
import { totalWrites } from '@/lib/eventThreads/writes';

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

export function parseEventThreadsBuildArgs(argv: string[]): EventThreadsBuildArgs {
  const sourceItemId = argValue(argv, '--source-item');
  if (!sourceItemId) {
    throw new Error('Missing --source-item <id>');
  }
  return {
    sourceItemId: sourceItemId.trim(),
    dryRun: argv.includes('--dry-run'),
    json: argv.includes('--json'),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatListenClock(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function formatDay(iso: string | null): string {
  if (!iso) return 'Unknown date';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'Unknown date';
  return new Date(parsed).toISOString().slice(0, 10);
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ').toUpperCase();
}

function emptyResolutionCounts(): Record<EventThreadResolutionType, number> {
  return {
    literal: 0,
    coreference: 0,
    semantic_role: 0,
    ellipsis: 0,
    discourse_context: 0,
    creator_analysis: 0,
    uncertain: 0,
  };
}

export function countResolutionTypes(threads: ProposedEventThread[]): Record<EventThreadResolutionType, number> {
  const counts = emptyResolutionCounts();
  for (const thread of threads) {
    for (const entry of thread.entries) {
      counts[entry.resolutionType] += 1;
    }
  }
  return counts;
}

function formatThreadChronology(thread: ProposedEventThread): string[] {
  const lines = [
    `THREAD  ${thread.title}`,
    `  slug: ${thread.slug}`,
    `  identity: ${thread.identityKey}`,
    `  creator_convergence: ${thread.creatorConvergenceCount}`,
    `  source_corroboration: ${thread.sourceCorroborationCount}`,
    '',
  ];
  const byDay = new Map<string, typeof thread.entries>();
  for (const entry of thread.entries) {
    const day = formatDay(entry.occurredAt);
    const list = byDay.get(day) || [];
    list.push(entry);
    byDay.set(day, list);
  }
  for (const [day, entries] of byDay) {
    lines.push(day);
    for (const entry of entries) {
      const listen = formatListenClock(entry.listenAnchorSeconds);
      lines.push(`  • ${kindLabel(entry.entryKind)} [${entry.resolutionType}/${entry.confidence}]`);
      if (entry.creatorName) lines.push(`    ${entry.creatorName}`);
      lines.push(`    ${entry.resolvedText}`);
      if (listen) lines.push(`    Listen from ${listen}`);
      if (entry.sourceUrl) lines.push(`    ${entry.sourceUrl}`);
    }
    lines.push('');
  }
  if (thread.intelLinks.length) {
    lines.push('  Intel/OSINT candidate links:');
    for (const link of thread.intelLinks) {
      lines.push(`    - ${link.sourceName || link.deskLane || link.linkKind}: ${link.title || link.sourceUrl || link.sourceItemId}`);
      lines.push(`      signals: ${link.matchSignals.join(', ') || '(none)'}`);
      if (link.sourceUrl) lines.push(`      Open article: ${link.sourceUrl}`);
    }
    lines.push('');
  }
  return lines;
}

export function formatEventThreadsReport(result: EventThreadsBuildResult): string {
  const resolution = EVENT_THREAD_RESOLUTION_TYPES.map(
    (type) => `  ${type}: ${result.resolutionTypeCounts[type]}`,
  ).join('\n');
  const lines = [
    'Event Threads V1',
    '================',
    '',
    `Source item: ${result.sourceItemId}`,
    `Atomic Notes considered: ${result.atomicNotesConsidered}`,
    `threads proposed: ${result.threadsProposed}`,
    `thread entries proposed: ${result.threadEntriesProposed}`,
    'resolution types:',
    resolution,
    `uncertain resolutions: ${result.uncertainResolutions}`,
    `Intel/OSINT candidate links: ${result.intelOsintCandidateLinks}`,
    `writes = ${totalWrites(result.writes)}`,
    `dry-run: ${result.persistence.dryRun ? 'yes' : 'no'}`,
    `notes mutated: ${result.persistence.notesMutated}`,
    '',
  ];
  if (result.rejectedInvalidAtomicNoteIds.length) {
    lines.push(`Rejected invalid Atomic Note IDs: ${result.rejectedInvalidAtomicNoteIds.join(', ')}`);
    lines.push('');
  }
  for (const thread of result.threads) {
    lines.push(...formatThreadChronology(thread));
  }
  return lines.join('\n').trimEnd();
}
