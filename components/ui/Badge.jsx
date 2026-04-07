export default function Badge({ children, className = '' }) {
  return (
    <span
      role="status"
      className={`machine-readout inline-flex items-center border border-hud-red/50 bg-hud-red-dim px-2 py-0.5 text-[10px] uppercase tracking-wider text-hud-dim ${className}`}
    >
      {children}
    </span>
  );
}
