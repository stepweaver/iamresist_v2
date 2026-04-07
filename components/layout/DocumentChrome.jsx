export default function DocumentChrome({ children, className = '' }) {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  return (
    <div className={`paper min-h-dvh pt-16 sm:pt-20 ${className}`}>
      {/* Metadata Banner (sticky, below nav) - mono for DOC ID, timestamps */}
      <div
        className="sticky top-16 sm:top-20 z-40 border-b rule bg-background/95 backdrop-blur"
        style={{ borderColor: 'var(--rule)' }}
      >
        <div className="font-mono px-1 sm:px-2 py-1.5 text-[10px] sm:text-xs tracking-widest text-foreground/80">
          <span className="mr-4">DOC ID: IAMR-BRIEF</span>
          <span className="text-hud-dim">{timestamp}</span>
        </div>
      </div>

      {/* Page content - minimal padding, full width */}
      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 pt-0 pb-4">{children}</div>
    </div>
  );
}
