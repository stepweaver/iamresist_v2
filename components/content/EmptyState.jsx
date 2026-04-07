import Link from 'next/link';

export default function EmptyState({
  title = 'No content available',
  description = 'This section is being updated. Please check back soon.',
  actionLabel,
  actionHref,
  className = '',
}) {
  return (
    <div className={`machine-panel relative p-8 text-center ${className}`}>
      <div className="absolute inset-0 hud-grid opacity-20"></div>
      <div className="relative z-10 space-y-4 max-w-md mx-auto">
        <div className="text-hud-dim font-mono text-xs mb-2">
          // NO SIGNAL
        </div>
        <h3 className="section-title text-2xl font-bold text-primary">
          {title}
        </h3>
        <p className="prose-copy text-foreground/70">
          {description}
        </p>
        {actionLabel && actionHref && (
          <div className="pt-4">
            <Link
              href={actionHref}
              className="nav-label inline-block px-6 py-2 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
            >
              {actionLabel} →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
