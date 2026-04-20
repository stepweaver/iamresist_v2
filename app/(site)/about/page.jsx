import PageContainer from '@/components/content/PageContainer';
import Divider from '@/components/ui/Divider';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'About',
  description:
    "A call to awareness. A chronicle of resistance. Independent, fact-based, and unapologetically antifascist.",
  urlPath: '/about',
});

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-MISSION-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                MANIFESTO
              </h1>
              <p className="mission-copy text-sm sm:text-base lg:text-lg text-foreground/70 mt-4 max-w-3xl leading-relaxed">
                A call to awareness. A chronicle of resistance.
              </p>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <article className="max-w-4xl mx-auto space-y-8 sm:space-y-12">
          <div className="border-l-2 border-primary pl-4 sm:pl-8">
            <p className="prose-copy text-base sm:text-lg leading-relaxed text-foreground/90">
              <a
                href="https://iamresist.org"
                className="text-primary hover:text-primary-light transition-colors font-semibold underline decoration-primary/30 hover:decoration-primary font-mono"
                target="_blank"
                rel="noopener noreferrer"
              >
                iamresist.org
              </a>{' '}
              is a personal project - not an organization, not a collective, not a party.
              It&apos;s a journal and an archive: a timeline of events, observations, and voices
              that document the authoritarian drift in America - a chronicle of the erosion
              of democracy, and a celebration of the journalists, artists, and citizens who
              resist authoritarianism.
            </p>
          </div>

          <Divider className="my-2" />

          <div>
            <p className="prose-copy text-base sm:text-lg leading-relaxed text-foreground/90 mb-6 sm:mb-8">
              This is not a call to arms - it&apos;s a call to awareness. The goal of this site
              is to educate, reflect, and resist the normalization of fascist ideas in America
              through art, writing, and community. I&apos;m not here to recruit or represent anyone
              but myself and I&apos;m not an expert. I&apos;m simply here to bear witness, to amplify
              fact-based reporting and antifascist creators, and to leave behind a record that
              calls things by their true name.
            </p>

            <div className="machine-panel border border-primary/30 p-6 sm:p-8">
              <div className="mb-4">
                <p className="kicker text-xs font-bold tracking-[0.3em] text-primary mb-1">
                  More About Me
                </p>
                <p className="prose-copy text-sm text-foreground/70">
                  I&apos;m a veteran who believes service doesn&apos;t end with a uniform. The oath to
                  defend the Constitution extends beyond the military-it&apos;s a lifelong commitment to truth,
                  democratic values, and the people who hold them together.
                </p>
              </div>
              <p className="prose-copy text-base sm:text-lg leading-relaxed text-foreground/90">
                I&apos;m a <span className="text-primary font-bold">Yankee Samurai</span> - trained
                to listen between the lines, to understand before speaking, and to see through
                the fog of propaganda. My allegiance is to truth, not ideology; to liberty, not
                conformity. I stand against disinformation, manipulation, and the silence that
                enables them.
              </p>
            </div>
          </div>

          <Divider className="my-2" />

          <div className="border-l-2 border-foreground/30 pl-4 sm:pl-8">
            <p className="prose-copy text-base sm:text-lg leading-relaxed text-foreground/90">
              This site is independent, self-funded, and unapologetically antifascist. It doubles
              as my own antifascist intel - a place to share videos, media, readings and ideas that
              strengthen our collective understanding of resistance.
            </p>
          </div>

          <Divider className="my-2" />

          <div className="space-y-4 sm:space-y-6">
            {[
              'I believe in democracy.',
              'I believe in truth.',
              'I believe silence in the face of fascism is surrender.',
            ].map((belief, index) => (
              <div
                key={index}
                className="machine-panel border-l-4 border-primary p-4 sm:p-6"
              >
                <p className="prose-copy text-lg sm:text-xl font-semibold text-foreground">
                  {belief}
                </p>
              </div>
            ))}
          </div>

          <Divider className="my-2" />

          <div id="manifesto" className="scroll-mt-20">
            <div className="mb-6">
              <h2 className="font-ui text-xl sm:text-2xl md:text-3xl font-bold tracking-wider text-primary mb-4">
                Meaning of the <span className="font-mono whitespace-nowrap">[RESIST]</span> Flag
              </h2>
              <p className="kicker text-xs font-bold tracking-[0.3em] text-primary mb-4">
                Vexillological Notes
              </p>
              <Divider className="mb-6" />
            </div>

            <div className="prose-copy space-y-6 text-base sm:text-lg leading-relaxed text-foreground/90">
              <p>
                The <span className="font-semibold">black field</span> represents the unknown - the space where dialogue and discovery begin.
              </p>
              <p>
                The <span className="font-semibold">white star</span> stands for truth and reason - the pursuit of understanding through open conversation.
              </p>
              <p className="border-l-2 border-primary pl-4 sm:pl-8">
                The <span className="font-semibold">three arrows</span> represent active resistance:
              </p>
              <div className="pl-6 sm:pl-12 space-y-4">
                <div className="flex gap-3">
                  <span className="text-primary text-2xl font-bold flex-shrink-0">↙</span>
                  <div>
                    <p className="font-bold text-primary mb-2">Anti-fascism</p>
                    <p className="text-foreground/80">Opposition to authoritarian control and the use of fear to dominate.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary text-2xl font-bold flex-shrink-0">↙</span>
                  <div>
                    <p className="font-bold text-primary mb-2">Anti-monarchism</p>
                    <p className="text-foreground/80">Rejection of inherited or absolute power; belief in shared authority and accountability.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary text-2xl font-bold flex-shrink-0">↙</span>
                  <div>
                    <p className="font-bold text-primary mb-2">Anti-exclusion</p>
                    <p className="text-foreground/80">Commitment to equality, inclusion, and the defense of every person&apos;s right to belong.</p>
                  </div>
                </div>
              </div>
              <p className="pt-4">
                The arrows point <span className="font-semibold">downward to ground truth</span> - to hold it firm against those who would raise themselves above others.
              </p>
              <div className="machine-panel border-2 border-primary/30 p-6 sm:p-8 mt-8">
                <p className="text-base sm:text-lg leading-relaxed mb-4">
                  This symbol is a statement against power without restraint, against silence enforced by fear, and against the rewriting of reality for control.
                </p>
                <p className="text-base sm:text-lg leading-relaxed font-semibold text-primary">
                  It stands for the right to question, to speak, and to be heard.
                </p>
              </div>
            </div>
          </div>

          <Divider className="my-2" />

          <div className="machine-panel border-2 border-primary p-6 sm:p-8 lg:p-12 text-center">
            <p className="prose-copy text-lg sm:text-xl leading-relaxed text-foreground/80 mb-6 sm:mb-8">
              For liberty, equality, truth, and the continual renewal of our shared humanity.
            </p>
            <p className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-wider text-primary">
              I AM <span className="font-mono">[RESIST]</span>
            </p>
          </div>

          <div className="pt-6 sm:pt-8 border-t border-border text-center">
            <p className="system-label text-foreground/60 text-xs sm:text-sm">
              This is a living document. The fight continues.
            </p>
          </div>
        </article>
      </PageContainer>
    </main>
  );
}
