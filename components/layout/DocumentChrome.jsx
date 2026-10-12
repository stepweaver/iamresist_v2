import MastheadClock from '@/components/layout/MastheadClock';

export default function DocumentChrome({ children, className = '' }) {
  return (
    <div className={`paper min-h-dvh pt-16 sm:pt-20 ${className}`}>
      {/* Metadata Banner (sticky, below nav) - mono for DOC ID, timestamps */}
      <div
        className="doc-masthead sticky top-16 sm:top-20 z-40 border-b rule bg-background/95 backdrop-blur"
      >
        <div className="flex items-baseline justify-between gap-3 font-mono px-1 sm:px-2 py-1.5 text-[10px] sm:text-xs tracking-widest text-foreground/80">
          <span className="min-w-0 truncate">DOC ID: IAMR-BRIEF</span>
          <MastheadClock />
        </div>
      </div>

      {/* Page content - minimal padding, full width */}
      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 pt-0 pb-4">{children}</div>
    </div>
  );
}
