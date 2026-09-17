import { intelDbConfigured } from '@/lib/intel/db';
import { resolveThemeRankingMode, type ThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import { themeIdentityFromCanonical } from '@/lib/themeMemory/normalize';
import {
  loadThemeAttentionForRanking,
  themeAttentionKey,
  type ThemeAttentionForItem,
  type ThemeAttentionItemRef,
  type ThemeAttentionThemeDiagnostic,
} from '@/lib/themeMemory/readModel';
import { createSupabaseThemeStore } from '@/lib/themeMemory/themesDb';
import type { ThemeSourceSystem } from '@/lib/themeMemory/types';

export type ThemeAttentionPrefetchItem = {
  id: string;
  sourceSystem?: ThemeSourceSystem;
  sourceSlug?: string | null;
  canonicalUrl?: string | null;
  url?: string | null;
  externalId?: string | null;
};

export type ThemeAttentionPrefetchResult = {
  mode: ThemeRankingMode;
  byId: Map<string, ThemeAttentionForItem | null>;
  themes: ThemeAttentionThemeDiagnostic[];
};

function toRef(item: ThemeAttentionPrefetchItem): ThemeAttentionItemRef | null {
  const url = item.canonicalUrl || item.url || '';
  if (!url || !item.sourceSlug) return null;
  const identity = themeIdentityFromCanonical({
    sourceSystem: item.sourceSystem || 'intel',
    sourceSlug: item.sourceSlug,
    canonicalUrl: url,
    externalId: item.externalId ?? null,
  });
  return {
    sourceSystem: identity.sourceSystem,
    sourceSlug: identity.sourceSlug,
    identityKey: identity.identityKey,
  };
}

/**
 * Batch-load persisted theme attention for a list of rankable items.
 * Off mode skips I/O. Never called from a sort comparator.
 */
export async function prefetchThemeAttentionByItemId(
  items: ThemeAttentionPrefetchItem[],
  opts: { mode?: ThemeRankingMode; now?: Date | string } = {},
): Promise<ThemeAttentionPrefetchResult> {
  const mode = opts.mode ?? resolveThemeRankingMode();
  const byId = new Map<string, ThemeAttentionForItem | null>();
  if (mode === 'off' || items.length === 0) {
    return { mode, byId, themes: [] };
  }
  if (!intelDbConfigured()) {
    return { mode, byId, themes: [] };
  }

  const refs: ThemeAttentionItemRef[] = [];
  const idByKey = new Map<string, string[]>();
  for (const item of items) {
    const ref = toRef(item);
    if (!ref) continue;
    refs.push(ref);
    const key = themeAttentionKey(ref);
    const list = idByKey.get(key) || [];
    list.push(item.id);
    idByKey.set(key, list);
  }

  try {
    const store = createSupabaseThemeStore({ now: opts.now });
    const loaded = await loadThemeAttentionForRanking(store, refs, { now: opts.now });
    for (const [key, value] of loaded.byItem) {
      for (const id of idByKey.get(key) || []) {
        byId.set(id, value);
      }
    }
    return { mode, byId, themes: loaded.themes };
  } catch (error) {
    console.warn('[theme-attention] batch prefetch failed; ranking continues without theme context', error);
  }

  return { mode, byId, themes: [] };
}
