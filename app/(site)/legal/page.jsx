export const metadata = {
  title: "Legal | I AM [RESIST]",
  description:
    "Legal disclosures, content attribution, terms of use, and privacy policy for I AM [RESIST]",
};

import PageContainer from '@/components/content/PageContainer';

export default function LegalPage() {
  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-LEGAL-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                LEGAL DISCLAIMERS
              </h1>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="legal-copy text-foreground/80 space-y-8">
          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              1. Content Attribution and Copyright
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                I AM [RESIST] is an independent publication. Unless otherwise
                noted, all original content on this website — including written
                articles, commentary, graphics, and code — is licensed under the
                Creative Commons Attribution-NonCommercial-ShareAlike 4.0
                International License (CC BY-NC-SA 4.0).
              </p>
              <p>
                External content is attributed to original creators. Book cover
                images and product images are used for identification purposes
                only. All rights reserved by their respective publishers,
                creators, and rights holders. All rights to third-party content
                remain with their respective owners.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              2. Trademark Usage
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                "I AM [RESIST]" and the resistance flag logo are trademarks of
                the I AM [RESIST] project. Use of these trademarks is prohibited
                without express written permission, except as permitted by law
                for commentary, criticism, or parody.
              </p>
              <p>
                All other trademarks and service marks displayed on this site are
                the property of their respective owners and may not be used
                without written permission from such owners.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              3. External Links
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                This website contains links to external websites not operated by
                I AM [RESIST]. We are not responsible for the content,
                privacy practices, or legality of any external site. We provide
                these links for convenience only and do not endorse the material
                on those sites.
              </p>
              <p>
                External sites may have privacy policies different from our own.
                We encourage users to review the privacy policies of any site
                they visit.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              4. Disclaimer of Warranties
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                This website is provided on an "as is" and "as available" basis
                without any warranties of any kind, either express or implied.
                We disclaim all warranties, including implied warranties of
                merchantability, fitness for a particular purpose, and
                non-infringement.
              </p>
              <p>
                We do not guarantee the accuracy, completeness, or usefulness of
                any information on this website. Any reliance on such information
                is at your own risk.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              5. Limitation of Liability
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                I AM [RESIST] and its contributors shall not be liable for any
                direct, indirect, incidental, special, consequential, or punitive
                damages arising out of or relating to your use of this website.
                This includes, without limitation, damages for loss of profits,
                goodwill, data, or other intangible losses.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              6. Privacy
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                We collect minimal personal data. Our practices are governed by
                this legal notice and our privacy statements embedded throughout
                the site. We do not sell your data. We use analytics to
                understand site usage. You may opt out via browser settings.
              </p>
              <p>
                For questions about data practices, contact:{" "}
                <a
                  href="mailto:privacy@iamresist.org"
                  className="text-primary hover:text-primary-light underline"
                >
                  privacy@iamresist.org
                </a>
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              7. Contact Information
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Support:</strong>{" "}
                <a
                  href="mailto:support@iamresist.org"
                  className="text-primary hover:text-primary-light underline"
                >
                  support@iamresist.org
                </a>
              </p>
              <p>
                <strong>Press Inquiries:</strong>{" "}
                <a
                  href="mailto:press@iamresist.org"
                  className="text-primary hover:text-primary-light underline"
                >
                  press@iamresist.org
                </a>
              </p>
              <p>
                <strong>Legal:</strong>{" "}
                <a
                  href="mailto:legal@iamresist.org"
                  className="text-primary hover:text-primary-light underline"
                >
                  legal@iamresist.org
                </a>
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              8. Last Updated
            </h2>
            <div className="text-sm text-foreground/70">
              <p>These legal disclosures were last updated on April 6, 2026.</p>
              <p className="mt-2">
                We reserve the right to modify these disclaimers at any time.
                Continued use of the site after changes constitutes acceptance of
                the updated terms.
              </p>
            </div>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
