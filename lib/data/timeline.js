import { timelineEvents } from '@/lib/data/timeline-events';

export { timelineEvents };

/** Preserves source dataset order (Brennan timeline sequence). */
export function getTimelineEvents() {
  return timelineEvents;
}

export function getTimelineEventsByCategory(category) {
  return timelineEvents.filter((event) => event.category === category);
}
