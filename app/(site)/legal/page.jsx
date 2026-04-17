export const metadata = {
  title: "Legal | I AM [RESIST]",
  description:
    "Legal disclosures, third-party content practices, attribution, terms of use, and privacy information for I AM [RESIST]",
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
              1. Third-Party Content and Attribution
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                I AM [RESIST] is an independent publication. Unless otherwise
                noted, original material published by this site - including site
                copy, editorial notes, original commentary, graphics, and code -
                is licensed under the Creative Commons
                Attribution-NonCommercial-ShareAlike 4.0 International License
                (CC BY-NC-SA 4.0).
              </p>
              <p>
                The site also displays third-party material drawn from public
                feeds, public web pages, and external media platforms. Depending
                on the section, that may include source names, headlines, dates,
                canonical links, short feed-derived excerpts or descriptions,
                remote images or thumbnails, and embedded platform players.
              </p>
              <p>
                Third-party content is attributed to the original publisher,
                creator, or platform where available. All rights in third-party
                material remain with the applicable rights holders. Display of
                third-party material on this site does not transfer ownership to
                I AM [RESIST].
              </p>
              <p>
                Book cover images, product images, and similar visual identifiers
                are used for identification, reference, and commentary purposes.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              2. Excerpts, Snippets, and Commentary Separation
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                The site is designed to point readers back to original reporting
                and creator pages, not to republish full articles, full feeds, or
                full media catalogs. Where the site displays third-party text, it
                is generally limited to titles, source labels, dates, short feed
                excerpts, or other brief descriptive metadata.
              </p>
              <p>
                Editorial notes, "why it matters" labels, curation notes, and
                other site-authored commentary are our own speech. They are
                presented separately from third-party headlines, excerpts, and
                media so readers can distinguish source material from our
                commentary and framing.
              </p>
              <p>
                Where practical, the site uses visible labels such as
                "Source preview," "Feed preview," "Source excerpt,"
                "Editorial note," "Commentary," and "Why it matters" to make
                that separation clearer.
              </p>
              <p>
                A headline, excerpt, or summary shown on this site may come from
                a publisher feed, a platform feed, or our own short editorial
                note attached to a linked item. Full context remains with the
                original source.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              3. External Media, Embeds, and Remote Hosting
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                Some pages link to or embed third-party media players and
                platform-hosted content, including video and audio hosted by
                services such as YouTube or other creator platforms. When you
                load an embedded player or open a source link, your browser may
                connect directly to that external service and may be subject to
                that service's terms, privacy practices, cookies, logging, and
                tracking behavior.
              </p>
              <p>
                The site may also display externally hosted images or thumbnails,
                including feed images, Open Graph images, or other source-linked
                artwork fetched from publisher infrastructure. Those files remain
                hosted by their original providers unless explicitly replaced by
                site-owned media.
              </p>
              <p>
                Availability of embedded or remote-hosted media may change
                without notice if a source removes, blocks, replaces, geofences,
                or restricts the underlying asset.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              4. No Affiliation or Endorsement
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                Linking to, embedding, excerpting, cataloging, or commenting on a
                source does not mean the source endorses I AM [RESIST], and it
                does not mean I AM [RESIST] endorses every statement made by that
                source, creator, platform, or publisher.
              </p>
              <p>
                Unless expressly stated, I AM [RESIST] is not affiliated with
                any linked publisher, creator, platform, brand, government
                agency, or rights holder whose material is referenced on the
                site.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              5. Trademark Usage
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
              6. External Links
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                This website contains links to external websites not operated by
                I AM [RESIST]. We are not responsible for the content,
                availability, privacy practices, or legality of any external
                site. We provide those links for reference and navigation only.
              </p>
              <p>
                External sites may have policies, security practices, or terms
                different from ours. Review the policies of any external service
                you choose to use.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              7. Copyright Concerns and Takedown Contact
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                If you believe material on this site infringes your copyright or
                is being used in a way that should be reviewed, contact{" "}
                <a
                  href="mailto:legal@iamresist.org"
                  className="text-primary hover:text-primary-light underline"
                >
                  legal@iamresist.org
                </a>{" "}
                with the relevant URL, the material at issue, your relationship
                to the rights in that material, and the requested action.
              </p>
              <p>
                We review specific, good-faith requests and may remove, shorten,
                relabel, de-embed, or otherwise restrict challenged material while
                we evaluate the issue. The fastest path is a precise notice that
                identifies the page or asset in question.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              8. Disclaimer of Warranties
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                This website is provided on an "as is" and "as available" basis
                without warranties of any kind, either express or implied. We
                disclaim implied warranties of merchantability, fitness for a
                particular purpose, and non-infringement to the extent permitted
                by law.
              </p>
              <p>
                We do not guarantee the accuracy, completeness, continued
                availability, or usefulness of any information, feed item,
                excerpt, image, embed, or link shown on this website. Any
                reliance on such material is at your own risk.
              </p>
            </div>
          </section>

          <section className="machine-panel p-6">
            <h2 className="font-display text-xl font-bold text-foreground mb-4 border-b border-border pb-2">
              9. Limitation of Liability
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
              10. Privacy
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                We collect minimal personal data. Our practices are governed by
                this legal notice and our privacy statements embedded throughout
                the site. We do not sell your data. We use analytics to
                understand site usage. Embedded third-party media and outbound
                links may result in separate data collection by the relevant
                external service. You may opt out where available through your
                browser or the external service's own controls.
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
              11. Contact Information
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
              12. Last Updated
            </h2>
            <div className="text-sm text-foreground/70">
              <p>These legal disclosures were last updated on April 17, 2026.</p>
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
