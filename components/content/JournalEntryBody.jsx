import { formatDate } from '@/lib/utils/date';

export default function JournalEntryBody({ entry, showTitle = true }) {
  const { title, date, author, category, content } = entry;

  return (
    <article className="relative">
      {showTitle && (
        <div className="mb-8 border-l-4 border-primary pl-6">
          <div className="font-mono text-[10px] text-hud-dim tracking-wider mb-3">
            DOC ID: IAMR-JOURNAL-{Date.parse(date).toString().slice(-4)}
          </div>
          <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
            {title}
          </h1>
          <div className="flex items-center gap-4 font-mono text-xs text-hud-dim">
            <span>{category}</span>
            <span className="text-hud-dim">|</span>
            <time>{formatDate(date)}</time>
            <span className="text-hud-dim">|</span>
            <span>BY {author.toUpperCase()}</span>
          </div>
        </div>
      )}

      <div className="machine-panel border border-border p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 hud-grid opacity-10"></div>
        <div className="relative z-10">
          <div className="prose-copy text-foreground/90 leading-relaxed whitespace-pre-line">
            {content}
          </div>
        </div>
      </div>
    </article>
  );
}
