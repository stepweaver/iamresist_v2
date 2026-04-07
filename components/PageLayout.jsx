/**
 * Shared page layout with grid background.
 * Use for content pages that need the standard main + background pattern.
 */
export default function PageLayout({ children, className = '' }) {
  return (
    <main
      id="main-content"
      className={`min-h-screen overflow-x-hidden ${className}`.trim()}
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      {children}
    </main>
  );
}
