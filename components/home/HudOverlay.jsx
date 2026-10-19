export function TargetReticle() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-testid="hero-reticle">
      <span className="absolute top-0 left-0 h-4 w-4 border-t border-l border-hud-red/80 sm:h-6 sm:w-6" />
      <span className="absolute top-0 right-0 h-4 w-4 border-t border-r border-hud-red/80 sm:h-6 sm:w-6" />
      <span className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-hud-red/80 sm:h-6 sm:w-6" />
      <span className="absolute right-0 bottom-0 h-4 w-4 border-r border-b border-hud-red/80 sm:h-6 sm:w-6" />

      <span className="absolute inset-[8%] hidden rounded-full border border-dashed border-hud-red/35 md:block" />
      <span className="absolute inset-[18%] rounded-full border border-hud-red/30" />

      <span className="absolute top-1/2 left-[3%] h-px w-[11%] -translate-y-1/2 bg-hud-red/35" />
      <span className="absolute top-1/2 right-[3%] h-px w-[11%] -translate-y-1/2 bg-hud-red/35" />
      <span className="absolute top-[3%] left-1/2 h-[11%] w-px -translate-x-1/2 bg-hud-red/35" />
      <span className="absolute bottom-[3%] left-1/2 h-[11%] w-px -translate-x-1/2 bg-hud-red/35" />

      <span className="absolute top-1/2 left-[24%] hidden h-px w-[5%] -translate-y-1/2 bg-hud-red/25 md:block" />
      <span className="absolute top-1/2 right-[24%] hidden h-px w-[5%] -translate-y-1/2 bg-hud-red/25 md:block" />
      <span className="absolute top-[24%] left-1/2 hidden h-[5%] w-px -translate-x-1/2 bg-hud-red/25 md:block" />
      <span className="absolute bottom-[24%] left-1/2 hidden h-[5%] w-px -translate-x-1/2 bg-hud-red/25 md:block" />
    </div>
  );
}

export default function HudOverlay({ title, code }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute top-0 left-0 h-8 w-8 border-t-2 border-l-2 border-hud-red opacity-60 sm:h-12 sm:w-12 lg:h-16 lg:w-16" />
      <div className="absolute top-0 right-0 h-8 w-8 border-t-2 border-r-2 border-hud-red opacity-60 sm:h-12 sm:w-12 lg:h-16 lg:w-16" />
      <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-hud-red opacity-60 sm:h-12 sm:w-12 lg:h-16 lg:w-16" />
      <div className="absolute right-0 bottom-0 h-8 w-8 border-r-2 border-b-2 border-hud-red opacity-60 sm:h-12 sm:w-12 lg:h-16 lg:w-16" />

      <div className="absolute top-[14px] left-[14px] font-mono text-[10px] text-hud-dim">
        {code}
      </div>
      <div className="absolute top-[14px] right-[14px] text-right font-mono text-[10px] text-hud-dim">
        {title}
      </div>
    </div>
  );
}
