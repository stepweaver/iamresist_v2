import PageContainer from '@/components/content/PageContainer';
import Divider from '@/components/ui/Divider';
import ResistanceBriefSignup from '@/components/subscribe/ResistanceBriefSignup';

export const metadata = {
  title: 'Subscribe | I AM [RESIST]',
  description: 'Get the [RESIST] Brief — a weekly email on what changed, what matters, and where the receipts are.',
};

export default function SubscribePage({ searchParams }) {
  const confirmed = searchParams?.confirmed;
  const showConfirmed = confirmed === '1';
  const showFailed = confirmed === '0';

  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30" />
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-BRIEF-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                SUBSCRIBE
              </h1>
              <p className="mission-copy text-sm sm:text-base lg:text-lg text-foreground/70 mt-4 max-w-3xl leading-relaxed">
                Owned audience, minimal noise. Double opt-in. Serious only.
              </p>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="max-w-3xl mx-auto space-y-6">
          {showConfirmed ? (
            <div className="machine-panel border border-primary/30 p-5 sm:p-6">
              <p className="kicker text-xs font-bold tracking-[0.3em] text-primary mb-2">
                Confirmed
              </p>
              <p className="prose-copy text-sm sm:text-base text-foreground/80">
                Confirmed. You’ll get the [RESIST] Brief.
              </p>
            </div>
          ) : null}

          {showFailed ? (
            <div className="machine-panel border border-border p-5 sm:p-6">
              <p className="kicker text-xs font-bold tracking-[0.3em] text-primary mb-2">
                Link issue
              </p>
              <p className="prose-copy text-sm sm:text-base text-foreground/80">
                This link expired or is invalid. Enter your email below to request a new confirmation.
              </p>
            </div>
          ) : null}

          <ResistanceBriefSignup source="subscribe_page" />

          <Divider className="my-2" />

          <div className="legal-copy text-xs text-foreground/70 leading-relaxed">
            If you have issues subscribing, email{' '}
            <a
              href="mailto:support@iamresist.org"
              className="text-primary hover:text-primary-light underline decoration-primary/30 hover:decoration-primary"
            >
              support@iamresist.org
            </a>
            .
          </div>
        </div>
      </PageContainer>
    </main>
  );
}

