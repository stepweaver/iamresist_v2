import { timelineEvents } from '@/lib/data/timeline-events';

export { timelineEvents };

/** Preserves source dataset order (Brennan timeline sequence). */
export function getTimelineEvents() {
  return timelineEvents;
}

export function getTimelineEventsByCategory(category) {
  return timelineEvents.filter((event) => event.category === category);
}

export function timelineCategorySlug(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Coverage derived from the maintained event list. Does not add events. */
export function summarizeTimeline(events = timelineEvents) {
  const list = Array.isArray(events) ? events : [];
  const dated = list
    .map((event) => ({ event, time: new Date(event?.date).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  const categories = [];
  const seen = new Set();
  for (const event of list) {
    const category = String(event?.category || '').trim();
    if (!category || seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }
  return {
    count: list.length,
    startLabel: dated[0]?.event?.date || '',
    endLabel: dated[dated.length - 1]?.event?.date || '',
    categories,
  };
}
