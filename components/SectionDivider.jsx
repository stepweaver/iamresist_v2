export default function SectionDivider({ className = '' }) {
    return (
      <div
        className={`relative h-0.5 ${className}`}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, var(--antifa-red) 20%, var(--antifa-red) 80%, transparent 100%)',
          transform: 'skewY(-1deg)'
        }}
      />
    );
  }
  
  