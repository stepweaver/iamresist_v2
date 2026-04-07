import Link from 'next/link';

export default function NewswireSourceCard({ source }) {
  const { name, slug, homepage, description, supportUrl, badges } = source;

  return (
    <div className="machine-panel border border-border p-4 h-full">
      <div className="flex flex-col h-full">
        <h3 className="font-ui text-sm font-bold text-foreground mb-2">
          {name}
        </h3>
        {description && (
          <p className="prose-copy text-xs text-foreground/70 mb-3 flex-1">
            {description}
          </p>
        )}
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {badges.map((badge, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-[10px] uppercase tracking-wider border border-border/60 text-foreground/60"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-auto">
          {homepage && (
            <Link
              href={homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-label text-xs text-primary hover:underline"
            >
              Visit site
            </Link>
          )}
          {supportUrl && (
            <Link
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-label text-xs text-foreground/70 hover:text-primary hover:underline"
            >
              Support
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
