import {
  CREATOR_NOTES_BATCH_DEFAULT_LIMIT,
  CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS,
  CREATOR_NOTES_BATCH_HARD_MAX,
  CREATOR_NOTES_BATCH_MAX_SINCE_HOURS,
} from '@/lib/creatorNotes/constants';
import {
  dedupeVoiceIdentities,
  isEligibleYouTubeVoiceItem,
  loadVoiceCatalogItems,
  sortVoiceItemsNewestFirst,
  type CreatorVoiceCatalogItem,
} from '@/lib/creatorNotes/resolveSource';

export type CreatorNotesSelectOpts = {
  limit?: number;
  creator?: string | null;
  sinceHours?: number;
  now?: Date | string;
};

export type CreatorNotesSelectDeps = {
  listVoiceItems?: () => Promise<CreatorVoiceCatalogItem[]>;
};

export function clampCreatorNotesBatchLimit(limit: number): number {
  if (!Number.isFinite(limit)) return CREATOR_NOTES_BATCH_DEFAULT_LIMIT;
  return Math.max(1, Math.min(CREATOR_NOTES_BATCH_HARD_MAX, Math.round(limit)));
}

export function clampCreatorNotesSinceHours(hours: number): number {
  if (!Number.isFinite(hours)) return CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS;
  return Math.max(1, Math.min(CREATOR_NOTES_BATCH_MAX_SINCE_HOURS, Math.round(hours)));
}

export function voiceItemInRecencyWindow(
  item: { publishedAt?: string | null },
  sinceHours: number,
  now: Date,
): boolean {
  if (!item.publishedAt) return false;
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published)) return false;
  const windowMs = clampCreatorNotesSinceHours(sinceHours) * 60 * 60 * 1000;
  return published >= now.getTime() - windowMs && published <= now.getTime() + 60 * 1000;
}

export function matchesCreatorSlug(
  item: { creatorId?: string | null },
  creator: string | null | undefined,
): boolean {
  const needle = String(creator || '').trim().toLowerCase();
  if (!needle) return true;
  return String(item.creatorId || '').trim().toLowerCase() === needle;
}

export function selectEligibleCreatorNotesItems(
  items: CreatorVoiceCatalogItem[],
  opts: CreatorNotesSelectOpts = {},
): CreatorVoiceCatalogItem[] {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const sinceHours = clampCreatorNotesSinceHours(
    opts.sinceHours == null ? CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS : Number(opts.sinceHours),
  );
  const limit = clampCreatorNotesBatchLimit(
    opts.limit == null ? CREATOR_NOTES_BATCH_DEFAULT_LIMIT : Number(opts.limit),
  );

  const selected = dedupeVoiceIdentities(
    sortVoiceItemsNewestFirst(
      items.filter(
        (item) =>
          isEligibleYouTubeVoiceItem(item) &&
          matchesCreatorSlug(item, opts.creator) &&
          voiceItemInRecencyWindow(item, sinceHours, now),
      ),
    ),
  );

  return selected.slice(0, limit);
}

export async function loadCreatorNotesBatchCandidates(
  opts: CreatorNotesSelectOpts = {},
  deps: CreatorNotesSelectDeps = {},
): Promise<CreatorVoiceCatalogItem[]> {
  const listVoiceItems = deps.listVoiceItems || loadVoiceCatalogItems;
  const items = await listVoiceItems();
  return selectEligibleCreatorNotesItems(items, opts);
}
