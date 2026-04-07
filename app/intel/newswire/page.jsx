import { Suspense } from "react";
import IntelTabs from "@/components/IntelTabs";
import { getNewswireData } from "@/lib/newswire";
import NewswireHeadlinesSection from "@/components/newswire/NewswireHeadlinesSection";
import NewswireSourceCard from "@/components/newswire/NewswireSourceCard";
import Divider from "@/components/ui/Divider";
import { buildPageMetadata } from "@/lib/metadata";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Intel // Newswire | I AM [RESIST]",
  description:
    "A curated feed of independent, reader-supported journalism. Headlines, direct links, minimal algorithmic interference. Read here. Click through. Support the source.",
  urlPath: "/intel/newswire",
});

function SourceDirectoryGrid({ sources }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {sources.map((source) => (
        <NewswireSourceCard key={source.slug} source={source} />
      ))}
    </div>
  );
}

async function NewswireContent() {
  const { stories, sources } = await getNewswireData();

  return (
    <>
      <NewswireHeadlinesSection stories={stories} sources={sources} />

      <Divider className="my-8 sm:my-12" />

      <section className="mb-8 sm:mb-12">
        <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-foreground mb-4">
          Source Directory
        </h2>
        <SourceDirectoryGrid sources={sources} />
      </section>

      <Divider className="my-8 sm:my-12" />

      <section className="mb-8 sm:mb-12">
        <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-foreground mb-4">
          Why This Exists
        </h2>
        <div className="border-l-2 border-primary pl-4 sm:pl-6 py-2">
          <p className="text-sm sm:text-base text-foreground/90 leading-relaxed mb-3">
            Independent journalism is expensive, adversarial, and often underfunded. This page is a curated access point designed to help readers find important reporting quickly and support the original outlets directly.
          </p>
          <p className="text-sm sm:text-base text-foreground/90 leading-relaxed">
            We surface headlines, source names, publication dates, and short excerpts where permitted. Full reporting lives with the original publisher. Every item links back to the source.
          </p>
        </div>
      </section>

      <Divider className="my-8 sm:my-12" />

      <section className="mb-8 sm:mb-12">
        <div className="border border-primary/50 bg-primary/5 p-6 sm:p-8">
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-primary mb-3">
            Support Independent Media
          </h2>
          <p className="text-sm sm:text-base text-foreground/90 leading-relaxed">
            If this reporting matters, support the people doing it. Subscribe, donate, and share directly.
          </p>
          <p className="text-xs sm:text-sm text-foreground/70 uppercase tracking-wider mt-4">
            If a publication does critical work, support it directly through a subscription, donation, or membership.
          </p>
        </div>
      </section>
    </>
  );
}

export default async function NewswirePage() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip"
      style={{
        backgroundImage:
          "linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs
          description="Independent headlines. Direct links. Minimal algorithmic interference. A curated feed of reader-supported and independent journalism. Read here. Click through. Support the source."
        />

        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm py-8">
              Loading…
            </p>
          }
        >
          <NewswireContent />
        </Suspense>
      </div>
    </main>
  );
}
