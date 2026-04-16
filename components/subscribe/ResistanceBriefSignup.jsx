import Card from '@/components/Card';
import SubscribeFormClient from '@/components/subscribe/SubscribeForm.client';

export default function ResistanceBriefSignup({ source = null, compact = false, className = '' }) {
  return (
    <Card className={`p-4 sm:p-6 border-primary/30 hover:border-primary transition-colors ${className}`.trim()}>
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] block font-bold mb-1">
            [RESIST] Brief
          </span>
          <h2 className="font-ui text-lg sm:text-xl font-bold mb-2">
            Get the [RESIST] Brief
          </h2>
          <p className="prose-copy text-xs sm:text-sm text-foreground/70">
            A weekly email on what changed, what matters, and where the receipts are.
          </p>
        </div>
        <SubscribeFormClient source={source} compact={compact} />
      </div>
    </Card>
  );
}

