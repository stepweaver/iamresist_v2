export default function Stamp({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-stamp border border-stamp/30 bg-stamp/10 ${className}`}
    >
      {children}
    </span>
  );
}
