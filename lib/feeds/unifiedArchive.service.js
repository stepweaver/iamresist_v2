// lib/feeds/unifiedArchive.service.js
import { unstable_cache } from "next/cache";
import { getVoicesFeed } from "@/lib/voices";

const REVALIDATE = 120; // match source
const ARCHIVE_PAGE_SIZE = 20;

function normalizeFilters(filters = {}) {
  return {
    sourceType: filters.sourceType ?? "",
    voiceSlug: filters.voiceSlug ?? "",
    artistSlug: filters.artistSlug ?? "",
  };
}

/**
 * Raw archive items based on filters.
 * Currently only supports voices sourceType.
 */
async function buildUnifiedArchiveRaw(filters = {}) {
  const f = normalizeFilters(filters);

  // Determine which sources to include
  const includeVoices = f.sourceType === "" || f.sourceType === "voices";

  let items = [];

  if (includeVoices) {
    const voicesItems = await getVoicesFeed();
    // Apply voiceSlug filter if provided
    if (f.voiceSlug) {
      items = voicesItems.filter((it) => it.voice?.slug === f.voiceSlug);
    } else {
      items = voicesItems;
    }
  }

  // Future: include protest-music, curated-videos based on f.sourceType

  return items;
}

function unifiedCacheKey(filters) {
  const f = normalizeFilters(filters);
  return ["unified-archive", f.sourceType, f.voiceSlug, f.artistSlug];
}

async function getCachedUnifiedArchiveRaw(filters) {
  const key = unifiedCacheKey(filters);
  return unstable_cache(
    () => buildUnifiedArchiveRaw(filters),
    key,
    { revalidate: REVALIDATE, tags: ["unified-archive"] }
  )();
}

/**
 * Returns a paginated page of the unified archive.
 */
export async function getUnifiedArchivePage(page = 1, limit = ARCHIVE_PAGE_SIZE, filters = {}) {
  const full = await getCachedUnifiedArchiveRaw(filters);
  const start = (page - 1) * limit;
  const end = start + limit;
  const slice = full.slice(start, end);
  return {
    items: slice,
    hasMore: end < full.length,
    total: full.length,
  };
}
