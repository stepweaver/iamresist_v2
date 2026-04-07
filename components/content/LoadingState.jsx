export function LoadingState({ className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Skeleton title */}
      <div className="h-8 bg-military-grey/30 rounded animate-pulse w-3/4"></div>
      
      {/* Skeleton lines */}
      <div className="space-y-2">
        <div className="h-4 bg-military-grey/20 rounded animate-pulse"></div>
        <div className="h-4 bg-military-grey/20 rounded animate-pulse w-5/6"></div>
        <div className="h-4 bg-military-grey/20 rounded animate-pulse w-4/6"></div>
      </div>
      
      {/* Skeleton block */}
      <div className="h-32 bg-military-grey/20 rounded animate-pulse mt-4"></div>
    </div>
  );
}

export function LoadingCard({ className = '' }) {
  return (
    <div className={`machine-panel p-4 rounded ${className}`}>
      <div className="space-y-3">
        <div className="h-6 bg-military-grey/30 rounded animate-pulse w-2/3"></div>
        <div className="h-4 bg-military-grey/20 rounded animate-pulse"></div>
        <div className="h-4 bg-military-grey/20 rounded animate-pulse w-5/6"></div>
        <div className="h-20 bg-military-grey/20 rounded animate-pulse mt-2"></div>
      </div>
    </div>
  );
}

export function LoadingGrid({ count = 3, className = '' }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <LoadingCard key={i} />
      ))}
    </div>
  );
}
