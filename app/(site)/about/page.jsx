import Link from 'next/link';

export const metadata = {
  title: "Mission | I AM [RESIST]",
  description:
    "Our mission: A call to awareness. A chronicle of resistance against authoritarianism and fascism in America.",
};

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
                OUR MISSION
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 lg:gap-12">
          <aside className="space-y-6">
            <div className="machine-panel p-4">
              <div className="font-mono text-[10px] text-hud-dim mb-2">
                // CLASSIFICATION: PUBLIC
              </div>
              <h3 className="font-display text-lg font-bold text-primary mb-3">
                PURPOSE
              </h3>
              <p className="prose-copy text-sm text-foreground/80 leading-relaxed">
                I AM [RESIST] exists to document, amplify, and organize resistance
                against the erosion of democratic norms and the rise of
                authoritarianism in the United States.
              </p>
            </div>

            <div className="machine-panel p-4">
              <div className="font-mono text-[10px] text-hud-dim mb-2">
                // FOCUS AREAS
              </div>
              <ul className="space-y-2">
                {[
                  'Constitutional Rights',
                  'Authoritarian Drift',
                  'Mass Surveillance',
                  'Wealth Inequality',
                  'Media Manipulation',
                  'ICE & Deportation',
                  'Police Accountability',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-primary mt-1">▸</span>
                    <span className="prose-copy text-sm text-foreground/80">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <article className="space-y-8">
            <section>
              <h2 className="font-display text-2xl font-bold text-foreground mb-4 border-b border-border pb-2">
                What We Do
              </h2>
              <div className="space-y-4 prose-copy text-foreground/80">
                <p>
                  We are a collective of journalists, activists, technologists,
                  and ordinary citizens who believe in the power of informed
                  dissent. Our work spans multiple domains:
                </p>
                <ul className="space-y-3 ml-4 list-disc">
                  <li>
                    <strong>Journalism:</strong> Original reporting and analysis
                    on authoritarian trends, civil liberties violations, and
                    resistance movements.
                  </li>
                  <li>
                    <strong>Archiving:</strong> Permanent record of events,
                    statements, and developments that mainstream media
                    misrepresents or ignores.
                  </li>
                  <li>
                    <strong>Community:</strong> Building networks of resistance
                    through our Discord community and local chapter connections.
                  </li>
                  <li>
                    <strong>Resources:</strong> Curated guides, toolkits, and
                    educational materials for effective activism.
                  </li>
                  <li>
                    <strong>Merchandise:</strong> High-quality goods that fund
                    our operations and spread awareness.
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-foreground mb-4 border-b border-border pb-2">
                Our Principles
              </h2>
              <div className="space-y-4 prose-copy text-foreground/80">
                <p>We are guided by these core principles:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      title: 'Fact-Based',
                      desc: 'We verify sources, cite evidence, and correct errors transparently.',
                    },
                    {
                      title: 'Unapologetic',
                      desc: 'We take a clear stance against fascism, racism, and authoritarianism.',
                    },
                    {
                      title: 'Inclusive',
                      desc: 'We welcome all who stand for justice, regardless of background.',
                    },
                    {
                      title: 'Resilient',
                      desc: 'We persist in the face of suppression, censorship, and attacks.',
                    },
                  ].map((principle) => (
                    <div key={principle.title} className="machine-panel p-4">
                      <h4 className="font-display text-sm font-bold text-primary mb-2">
                        {principle.title.toUpperCase()}
                      </h4>
                      <p className="text-xs text-foreground/70">
                        {principle.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold text-foreground mb-4 border-b border-border pb-2">
                Get Involved
              </h2>
              <div className="space-y-4 prose-copy text-foreground/80">
                <p>
                  Resistance requires collective action. Here's how you can join
                  the movement:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                  {[
                    {
                      label: 'JOIN DISCORD',
                      desc: 'Connect with our community',
                      href: '/',
                    },
                    {
                      label: 'SUBSCRIBE',
                      desc: 'Get weekly intelligence',
                      href: '/',
                    },
                    {
                      label: 'DONATE',
                      desc: 'Support independent media',
                      href: '/shop',
                    },
                  ].map((action) => (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="machine-panel p-4 text-center group hover:border-primary transition-colors"
                    >
                      <div className="font-mono text-[10px] text-hud-dim mb-2">
                        ACTION REQUIRED
                      </div>
                      <div className="font-display text-lg font-bold text-foreground group-hover:text-primary mb-1">
                        {action.label}
                      </div>
                      <div className="prose-copy text-xs text-foreground/60">
                        {action.desc}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}
