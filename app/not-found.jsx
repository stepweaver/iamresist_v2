export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <div className="machine-panel relative p-8 max-w-md">
          <div className="absolute inset-0 hud-grid opacity-30"></div>
          <div className="relative z-10 space-y-4">
            <h1 className="hero-title text-6xl font-bold text-primary">404</h1>
            <p className="mission-copy text-xl">
              Signal Lost
            </p>
            <p className="prose-copy text-foreground/70">
              The requested briefing packet cannot be located.
            </p>
            <div className="pt-4 border-t border-border">
              <a href="/" className="nav-label text-primary hover:text-primary-light transition-colors">
                Return to Base →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
