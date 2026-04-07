export default function HudOverlay({ title, code }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top corners */}
      <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-hud-red opacity-60"></div>
      <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-hud-red opacity-60"></div>

      {/* Bottom corners */}
      <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-hud-red opacity-60"></div>
      <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-hud-red opacity-60"></div>

      {/* Horizontal crosshairs */}
      <div className="absolute top-1/2 left-8 right-8 h-px bg-hud-red/20"></div>
      <div className="absolute top-8 bottom-8 left-1/2 w-px bg-hud-red/20"></div>

      {/* Text labels */}
      <div className="absolute top-2 left-2 font-mono text-[10px] text-hud-dim">
        {code}
      </div>
      <div className="absolute top-2 right-2 font-mono text-[10px] text-hud-dim text-right">
        {title}
      </div>

      {/* Target brackets around center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 border-t border-l border-hud-red"></div>
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-2 h-2 border-t border-r border-hud-red"></div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 border-b border-l border-hud-red"></div>
        <div className="absolute bottom-0 right-1/2 translate-x-1/2 w-2 h-2 border-b border-r border-hud-red"></div>
      </div>
    </div>
  );
}
