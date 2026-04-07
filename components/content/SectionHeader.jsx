import Link from 'next/link';

export default function SectionHeader({
  title,
  subtitle,
  align = 'left',
  className = '',
}) {
  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div className={`mb-6 ${alignmentClasses[align]} ${className}`}>
      <h2 className="section-title text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-2">
        {title}
      </h2>
      {subtitle && (
        <p className="mission-copy text-sm sm:text-base text-foreground/70 max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
      <div className="mt-4 border-b border-border inline-block px-4 py-1 machine-panel">
        <span className="font-mono text-[10px] text-hud-dim tracking-wider">
          [{align.toUpperCase()}]
        </span>
      </div>
    </div>
  );
}
