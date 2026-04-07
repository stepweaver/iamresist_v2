import EmptyState from '@/components/content/EmptyState';
import PageContainer from '@/components/content/PageContainer';

export const metadata = {
  title: 'Supply | I AM [RESIST]',
  description:
    'Merchandise and supply — storefront integration is planned for a later release.',
};

export default function ShopPlaceholderPage() {
  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-SUPPLY-00
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                SUPPLY
              </h1>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="mb-8">
          <p className="mission-copy text-lg text-foreground/80 max-w-3xl">
            The supply room (shop) is not wired up in this rebuild yet. Checkout,
            Printify, and payments stay out of scope until the commerce batch.
          </p>
        </div>

        <EmptyState
          title="Storefront Not Available Yet"
          description="Merchandise and cart flows will return when the shop batch ships. Nothing is for sale here right now."
          actionLabel="Return to Briefing"
          actionHref="/"
        />
      </PageContainer>
    </main>
  );
}
