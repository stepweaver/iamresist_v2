import 'server-only';

import { loadWinningNotesForSourceItems } from '@/lib/creatorNotes/db';
import { isNonContentVoiceArtifact, loadVoiceCatalogItems } from '@/lib/creatorNotes/resolveSource';
import { buildHeadlineTimeline } from '@/lib/headlineTimeline/build';
import {
  candidateFromNewswireStory,
  candidateFromSourceItem,
  candidateFromVoiceItem,
  dedupeHeadlineCandidates,
  type HeadlineNewswireStory,
  type HeadlineSourceItemRecord,
} from '@/lib/headlineTimeline/candidates';
import {
  HEADLINE_TIMELINE_FETCH_LIMIT,
  HEADLINE_TIMELINE_WINDOW_HOURS,
} from '@/lib/headlineTimeline/constants';
import { intelDbConfigured } from '@/lib/intel/db';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import type { HeadlineCandidate, HeadlineNoteSeed, HeadlineTimeline } from '@/lib/headlineTimeline/types';

const SOURCE_ITEM_SELECT = `
  id,
  title,
  summary,
  canonical_url,
  published_at,
  surface_state,
  sources (
    id,
    slug,
    name,
    provenance_class,
    desk_lane
  )
`;

function noteSeed(note: CreatorAtomicNote): HeadlineNoteSeed {
  return {
    id: note.id,
    sourceItemId: note.sourceItemId,
    kind: note.kind,
    text: note.text,
    contentRole: note.contentRole || null,
    startSeconds: note.startSeconds,
    endSeconds: note.endSeconds,
    createdAt: note.createdAt || null,
  };
}

async function loadSourceItemCandidates(cutoffIso: string, warnings: string[]): Promise<HeadlineCandidate[]> {
  if (!intelDbConfigured()) {
    warnings.push('Supabase is not configured. Intel source titles were skipped.');
    return [];
  }
  const supabase = supabaseAdmin().schema('intel');
  const { data, error } = await supabase
    .from('source_items')
    .select(SOURCE_ITEM_SELECT)
    .gte('published_at', cutoffIso)
    .in('surface_state', ['surfaced', 'downranked'])
    .order('published_at', { ascending: false })
    .limit(HEADLINE_TIMELINE_FETCH_LIMIT);
  if (error) throw new Error(`source_items headline select: ${error.message}`);
  const rows = (data || []) as HeadlineSourceItemRecord[];
  return rows.map(candidateFromSourceItem).filter((item): item is HeadlineCandidate => Boolean(item));
}

async function loadVoiceCandidates(cutoffMs: number, warnings: string[]): Promise<HeadlineCandidate[]> {
  try {
    const items = await loadVoiceCatalogItems();
    return items
      .filter((item) => !isNonContentVoiceArtifact(item))
      .map((item) => candidateFromVoiceItem(item))
      .filter((item): item is HeadlineCandidate => Boolean(item))
      .filter((item) => {
        const stamp = Date.parse(item.publishedAt || '');
        return Number.isFinite(stamp) && stamp >= cutoffMs;
      });
  } catch (error) {
    warnings.push(error instanceof Error ? `Voices: ${error.message}` : 'Creator titles could not be read.');
    return [];
  }
}

async function loadNewswireCandidates(
  cutoffMs: number,
  mode: 'cached' | 'uncached',
  warnings: string[],
): Promise<HeadlineCandidate[]> {
  try {
    const mod = await import('@/lib/newswire');
    const stories = mode === 'uncached' ? await mod.getNewswireStoriesUncached() : await mod.getNewswireStories();
    return (Array.isArray(stories) ? stories : [])
      .map((story) => candidateFromNewswireStory(story as HeadlineNewswireStory))
      .filter((item): item is HeadlineCandidate => Boolean(item))
      .filter((item) => {
        const stamp = Date.parse(item.publishedAt || '');
        return Number.isFinite(stamp) && stamp >= cutoffMs;
      });
  } catch (error) {
    warnings.push(error instanceof Error ? `Newswire: ${error.message}` : 'Newswire headlines could not be read.');
    return [];
  }
}

export type LoadedHeadlineCandidates = {
  candidates: HeadlineCandidate[];
  warnings: string[];
  windowHours: number;
  generatedAt: string;
  counts: {
    intel: number;
    voices: number;
    newswire: number;
  };
};

/** Read-only candidate load shared by /brief and the Jev shadow eval. */
export async function loadHeadlineCandidates(opts?: {
  now?: Date;
  newswire?: 'cached' | 'uncached';
  windowHours?: number;
}): Promise<LoadedHeadlineCandidates> {
  const now = opts?.now instanceof Date ? opts.now : new Date();
  const windowHours = opts?.windowHours ?? HEADLINE_TIMELINE_WINDOW_HOURS;
  const cutoffMs = now.getTime() - windowHours * 3600000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const warnings: string[] = [];

  const [sourceItems, newswire, voices] = await Promise.all([
    loadSourceItemCandidates(cutoffIso, warnings).catch((error: unknown) => {
      warnings.push(error instanceof Error ? error.message : 'Intel source titles could not be read.');
      return [] as HeadlineCandidate[];
    }),
    loadNewswireCandidates(cutoffMs, opts?.newswire || 'cached', warnings),
    loadVoiceCandidates(cutoffMs, warnings),
  ]);

  const candidates = dedupeHeadlineCandidates([...sourceItems, ...voices, ...newswire]).filter((item) => {
    const stamp = Date.parse(item.publishedAt || '');
    return Number.isFinite(stamp) && stamp >= cutoffMs;
  });

  return {
    candidates,
    warnings,
    windowHours,
    generatedAt: now.toISOString(),
    counts: {
      intel: sourceItems.length,
      voices: voices.length,
      newswire: newswire.length,
    },
  };
}

export async function loadHeadlineTimeline(opts?: {
  now?: Date;
  newswire?: 'cached' | 'uncached';
  windowHours?: number;
}): Promise<HeadlineTimeline> {
  const now = opts?.now instanceof Date ? opts.now : new Date();
  const loaded = await loadHeadlineCandidates({ ...opts, now });
  const { candidates, warnings, windowHours } = loaded;

  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `[brief] intel ${loaded.counts.intel} voices ${loaded.counts.voices} newswire ${loaded.counts.newswire} kept ${candidates.length}`,
    );
  }

  let notes: HeadlineNoteSeed[] = [];
  const intelIds = candidates.filter((item) => item.channel !== 'newswire').map((item) => item.id);
  if (intelIds.length && intelDbConfigured()) {
    try {
      const noteRows = await loadWinningNotesForSourceItems(intelIds);
      notes = noteRows.map(noteSeed);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Atomic Creator Notes could not be read.');
    }
  }

  return buildHeadlineTimeline({ candidates, notes, now, warnings, windowHours });
}
