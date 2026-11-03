export function TargetReticle() {
  return (
    <div className="signal-plate pointer-events-none absolute" aria-hidden="true" data-testid="hero-reticle">
      <span className="signal-plate__corner signal-plate__corner--tl" />
      <span className="signal-plate__corner signal-plate__corner--tr" />
      <span className="signal-plate__corner signal-plate__corner--bl" />
      <span className="signal-plate__corner signal-plate__corner--br" />
      <span className="signal-plate__rail" />
      <span className="signal-plate__pip" />
    </div>
  );
}

export default function HudOverlay({ title, code }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
      data-title={title || undefined}
    >
      <span className="signal-frame__corner signal-frame__corner--tl" />
      <span className="signal-frame__corner signal-frame__corner--tr" />
      <span className="signal-frame__corner signal-frame__corner--bl" />
      <span className="signal-frame__corner signal-frame__corner--br" />
      <span className="signal-frame__code">{code}</span>
    </div>
  );
}
