/**
 * Shared page layout with grid background.
 * Use for content pages that need the standard main + background pattern.
 */
export default function PageLayout({ children, className = '' }) {
  return (
    <main
      id="main-content"
      className={`hero-page-bg min-h-screen overflow-x-hidden ${className}`.trim()}
    >
      {children}
    </main>
  );
}
