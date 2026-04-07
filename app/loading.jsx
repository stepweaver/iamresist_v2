export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="machine-panel relative p-8">
        <div className="absolute inset-0 hud-grid opacity-30"></div>
        <div className="relative z-10 space-y-4 text-center">
          <div className="font-mono text-hud-dim text-sm mb-2">
            ACQUIRING SIGNAL...
          </div>
          <div className="w-16 h-1 bg-primary/30 mx-auto overflow-hidden rounded">
            <div className="h-full bg-primary animate-pulse w-1/2"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
