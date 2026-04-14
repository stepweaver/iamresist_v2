import { Suspense } from 'react';
import IntelDeskWithSourceFilter from '@/components/intel/IntelDeskWithSourceFilter';
import IntelTabs from '@/components/IntelTabs';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Statements | I AM [RESIST]',
  description:
    'Direct claims and political statements from public sources — potential misinformation; not evidence. Isolated from OSINT and defense ranking.',
  urlPath: '/intel/statements',
});

const STATEMENTS_WARNING = (
  <div className="border border-amber-500/45 bg-amber-500/10 p-4 text-sm text-foreground/90 space-y-2 max-w-4xl">
    <p className="font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">Direct claims</p>
    <p className="leading-relaxed">
      This lane is for statements and reposted claims — labeled as potential misinformation and not evidence by itself.
      It is ranked below court orders, official releases, and investigative reporting, and does not share OSINT&apos;s
      default desk ranking.
    </p>
  </div>
);

async function StatementsContent() {
  const desk = await getLiveIntelDesk('statements');
  return <IntelDeskWithSourceFilter desk={desk} laneWarningSlot={STATEMENTS_WARNING} />;
}

export default function IntelStatementsPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs description="Statements: public claims and political speech — verify against primary sources; not a substitute for OSINT evidence." />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Statements lane…</p>
          }
        >
          <StatementsContent />
        </Suspense>
      </div>
    </main>
  );
}
