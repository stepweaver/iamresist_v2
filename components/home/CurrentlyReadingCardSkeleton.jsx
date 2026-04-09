import Card from '@/components/Card';

export default function CurrentlyReadingCardSkeleton() {
  return (
    <div className="mb-6 sm:mb-8">
      <Card className="p-4 sm:p-6 border-border">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-shrink-0 w-16 h-20 sm:w-20 sm:h-28 bg-foreground/10 rounded-sm animate-pulse" />

          <div className="flex-1 min-w-0 space-y-3">
            <div className="h-3 w-20 bg-foreground/10 rounded animate-pulse" />
            <div className="h-5 w-3/4 max-w-48 bg-foreground/10 rounded animate-pulse" />
            <div className="h-3 w-1/2 max-w-32 bg-foreground/10 rounded animate-pulse" />
            <div className="h-3 w-16 bg-foreground/10 rounded animate-pulse self-end" />
          </div>
        </div>
      </Card>
    </div>
  );
}
