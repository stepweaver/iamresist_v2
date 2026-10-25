import Card from '@/components/Card';

export function HomeLiveBriefingSkeleton() {
  return (
    <div className="mb-6 sm:mb-8" role="status" aria-label="Loading live briefing">
      <div className="h-3 w-28 bg-foreground/10 rounded animate-pulse mb-2" />
      <div className="h-3 w-full max-w-xl bg-foreground/10 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-4 sm:gap-5">
        <Card className="p-4 sm:p-5 border-border overflow-hidden">
          <div className="aspect-video bg-foreground/10 rounded animate-pulse mb-4" />
          <div className="flex gap-2 mb-3">
            <div className="h-3 w-20 bg-foreground/10 rounded animate-pulse" />
            <div className="h-3 w-24 bg-foreground/10 rounded animate-pulse" />
          </div>
          <div className="h-6 w-4/5 max-w-md bg-foreground/10 rounded animate-pulse mb-2" />
          <div className="h-3 w-full bg-foreground/10 rounded animate-pulse mb-1" />
          <div className="h-3 w-2/3 bg-foreground/10 rounded animate-pulse" />
        </Card>
        <div className="grid grid-cols-1 gap-4">
          <Card className="p-4 border-border overflow-hidden">
            <div className="h-4 w-3/4 bg-foreground/10 rounded animate-pulse mb-2" />
            <div className="h-3 w-1/2 bg-foreground/10 rounded animate-pulse" />
          </Card>
          <Card className="p-4 border-border overflow-hidden">
            <div className="h-4 w-3/4 bg-foreground/10 rounded animate-pulse mb-2" />
            <div className="h-3 w-1/2 bg-foreground/10 rounded animate-pulse" />
          </Card>
        </div>
      </div>
    </div>
  );
}

export function HomeTelescreenSkeleton({ className = 'mb-6 sm:mb-8' }) {
  return (
    <div className={className} role="status" aria-label="Loading Telescreen">
      <div className="mb-6 sm:mb-8 border-t border-border/60 pt-6 sm:pt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-2">
            <div className="h-3 w-28 bg-foreground/10 rounded animate-pulse" />
            <div className="h-3 w-full max-w-md bg-foreground/10 rounded animate-pulse" />
          </div>
          <div className="h-3 w-14 bg-foreground/10 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {[1, 2].map((i) => (
            <Card key={i} className="p-4 border-border overflow-hidden">
              <div className="aspect-video bg-foreground/10 rounded animate-pulse mb-3" />
              <div className="h-4 w-3/4 bg-foreground/10 rounded animate-pulse mb-2" />
              <div className="h-3 w-1/2 bg-foreground/10 rounded animate-pulse" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomeProtestMusicSkeleton({ count = 1 } = {}) {
  const visible = Math.max(1, count);
  const columns =
    visible > 1
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'
      : 'grid grid-cols-1 gap-3';
  return (
    <div className="mb-6 sm:mb-8" role="status" aria-label="Loading protest music">
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-28 bg-foreground/10 rounded animate-pulse" />
        <div className="h-3 w-24 bg-foreground/10 rounded animate-pulse" />
      </div>
      <div className={columns}>
        {Array.from({ length: visible }, (_, i) => (
          <Card key={i} className="p-4 border-border overflow-hidden">
            <div className="aspect-video bg-foreground/10 rounded animate-pulse mb-3" />
            <div className="h-4 w-3/4 bg-foreground/10 rounded animate-pulse mb-2" />
            <div className="h-3 w-1/2 bg-foreground/10 rounded animate-pulse" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export function HomeCultureSkeleton() {
  return (
    <div className="mb-6 sm:mb-8" role="status" aria-label="Loading culture">
      <div className="mb-4 h-3 w-24 animate-pulse rounded bg-foreground/10" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <HomeProtestMusicSkeleton />
        <div role="status" aria-label="Loading shelf book">
          <Card className="border-border p-4 sm:p-6">
            <div className="flex items-stretch gap-3 sm:gap-4">
              <div className="min-h-20 w-16 flex-shrink-0 animate-pulse rounded-sm bg-foreground/10 sm:min-h-28 sm:w-20" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-3 w-28 animate-pulse rounded bg-foreground/10" />
                <div className="h-5 w-3/4 max-w-48 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-1/2 max-w-32 animate-pulse rounded bg-foreground/10" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function HomeFeedSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-1 py-2 sm:px-2 sm:py-3 lg:px-3">
      <HomeLiveBriefingSkeleton />
      <HomeTelescreenSkeleton />
      <HomeCultureSkeleton />
      <Card className="border-border p-3 sm:p-4">
        <div className="h-3 w-36 animate-pulse rounded bg-foreground/10" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-foreground/10" />
      </Card>
    </div>
  );
}
