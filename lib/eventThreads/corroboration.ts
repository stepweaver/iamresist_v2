import type { ProposedEventThread } from '@/lib/eventThreads/types';

function creatorKey(value: string | null | undefined): string | null {
  const cleaned = String(value || '').trim().toLowerCase();
  return cleaned || null;
}

/**
 * Creator convergence is attention/relevance.
 * It is not independent factual corroboration.
 */
export function applyCorroborationSemantics(threads: ProposedEventThread[]): ProposedEventThread[] {
  return threads.map((thread) => {
    const creators = new Set<string>();
    for (const entry of thread.entries) {
      const key = creatorKey(entry.creatorName);
      if (key) creators.add(key);
    }
    const intelLinks = thread.intelLinks.filter((link) => link.linkKind === 'intel' || link.linkKind === 'osint');
    return {
      ...thread,
      creatorIds: [...creators],
      creatorConvergenceCount: creators.size,
      sourceCorroborationCount: intelLinks.length,
    };
  });
}
