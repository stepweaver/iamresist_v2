import { formatDate } from '@/lib/utils/date';
import { getTimelineEvents } from '@/lib/data/timeline';

export default function TimelineSection() {
  const events = getTimelineEvents();

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border"></div>

      <div className="space-y-8">
        {events.map((event, index) => (
          <div key={event.id} className="relative pl-12">
            {/* Timeline dot */}
            <div className="absolute left-2 top-6 w-4 h-4 bg-primary border-2 border-background rounded-full"></div>

            <div className="machine-panel border border-border p-6 relative overflow-hidden">
              <div className="absolute inset-0 hud-grid opacity-5"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
                    {event.category}
                  </span>
                  <span className="text-hud-dim">|</span>
                  <time className="font-mono text-[10px] text-hud-dim tracking-wider">
                    {formatDate(event.date)}
                  </time>
                </div>

                <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-3">
                  {event.title}
                </h3>

                <p className="prose-copy text-foreground/80 mb-4">
                  {event.summary}
                </p>

                {event.source && (
                  <div className="font-mono text-[10px] text-hud-dim tracking-wider border-t border-border pt-3">
                    SOURCE: {event.source}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
