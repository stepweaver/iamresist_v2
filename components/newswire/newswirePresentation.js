/** How many newswire headlines are on screen before the reader asks for more. */
export const NEWSWIRE_HEADLINE_BATCH = 12;

export function filterNewswireStories(stories, sourceSlug) {
  const list = Array.isArray(stories) ? stories : [];
  const slug = String(sourceSlug || '').trim();
  if (!slug) return list;
  return list.filter((story) => story?.sourceSlug === slug);
}

export function visibleNewswireStories(stories, visibleCount, batch = NEWSWIRE_HEADLINE_BATCH) {
  const list = Array.isArray(stories) ? stories : [];
  const cap = Number.isFinite(visibleCount) && visibleCount > 0 ? visibleCount : batch;
  return {
    visible: list.slice(0, cap),
    hasMore: list.length > cap,
  };
}
