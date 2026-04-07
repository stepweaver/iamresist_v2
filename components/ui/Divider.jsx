export default function Divider({ className = '' }) {
  return (
    <div className={`h-px bg-border ${className}`} role="separator" />
  );
}
