import Card from '@/components/Card';

export default function HomeFeedSkeleton() {
  return (
    <div className="w-full max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4 sm:py-6">
      <div className="mb-6 sm:mb-8">
        <Card className="p-4 sm:p-6 border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-foreground/10 rounded animate-pulse" />
              <div className="h-5 w-16 bg-foreground/10 rounded animate-pulse" />
              <div className="h-3 w-48 bg-foreground/10 rounded animate-pulse" />
            </div>
            <div className="h-10 w-28 bg-foreground/10 rounded animate-pulse" />
          </div>
        </Card>
      </div>

      <div className="mb-6 sm:mb-8">
        <Card className="p-4 sm:p-6 border-border">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-16 h-20 sm:w-20 sm:h-28 bg-foreground/10 rounded-sm animate-pulse" />
            <div className="flex-1 min-w-0 space-y-3">
              <div className="h-3 w-20 bg-foreground/10 rounded animate-pulse" />
              <div className="h-5 w-3/4 max-w-48 bg-foreground/10 rounded animate-pulse" />
              <div className="h-3 w-1/2 max-w-32 bg-foreground/10 rounded animate-pulse" />
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="h-3 w-24 bg-foreground/10 rounded animate-pulse" />
          <div className="h-3 w-16 bg-foreground/10 rounded animate-pulse" />
        </div>
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

      <div className="mb-6 sm:mb-8">
        <div className="h-3 w-40 bg-foreground/10 rounded animate-pulse mb-2" />
        <div className="h-3 w-full max-w-xl bg-foreground/10 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-16 bg-foreground/10 rounded animate-pulse" />
                <div className="h-3 w-14 bg-foreground/10 rounded animate-pulse" />
              </div>
              <Card className="p-3 sm:p-4 border-border overflow-hidden">
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-[72px] h-[72px] sm:w-20 sm:h-20 bg-foreground/10 rounded shrink-0 animate-pulse" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-3 w-24 bg-foreground/10 rounded animate-pulse" />
                    <div className="h-4 w-full bg-foreground/10 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-foreground/10 rounded animate-pulse" />
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 sm:mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-4 border-border overflow-hidden">
              <div className="aspect-video bg-foreground/10 rounded animate-pulse mb-3" />
              <div className="h-4 w-3/4 bg-foreground/10 rounded animate-pulse mb-2" />
              <div className="h-3 w-1/2 bg-foreground/10 rounded animate-pulse" />
            </Card>
          ))}
        </div>
      </div>

      <div>
        <Card className="p-4 sm:p-6 border-border">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-24 h-24 bg-foreground/10 rounded animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 bg-foreground/10 rounded animate-pulse" />
              <div className="h-5 w-48 bg-foreground/10 rounded animate-pulse" />
              <div className="h-3 w-32 bg-foreground/10 rounded animate-pulse" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
