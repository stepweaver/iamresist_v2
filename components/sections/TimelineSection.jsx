import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { getTimelineEvents } from '@/lib/data/timeline';

function formatTimelineCardDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return formatDate(d.toISOString());
}

export default function TimelineSection() {
  const events = getTimelineEvents();

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border"></div>

      <div className="space-y-8">
        {events.map((event, index) => (
          <div
            key={`${event.date}-${event.title}-${index}`}
            className="relative pl-12"
          >
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
                    {formatTimelineCardDate(event.date)}
                  </time>
                </div>

                <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-3">
                  {event.title}
                </h3>

                <p className="prose-copy text-foreground/80 mb-4">{event.description}</p>

                {event.link && (
                  <div className="font-mono text-[10px] text-hud-dim tracking-wider border-t border-border pt-3">
                    <Link
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline uppercase"
                    >
                      View source timeline -&gt;
                    </Link>
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
