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

      <Divider className="my-8 sm:my-10" />

      <section id="source-directory" className="mb-8 scroll-mt-24 sm:mb-10">
        <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-foreground mb-4">
          Source Directory
        </h2>
        <SourceDirectoryGrid sources={sources} />
      </section>

      <section className="mb-8 sm:mb-10">
        <p className="max-w-3xl text-sm sm:text-base text-foreground/80 leading-relaxed">
          Headlines here link to the original publisher. If a publication&apos;s reporting matters to you, support that publication directly.
        </p>
      </section>
    </>
  );
}

export default async function NewswirePage() {
  return (
    <main
      id="main-content"
      className="hero-page-bg min-h-screen overflow-x-clip"
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs description="Independent headlines with the publisher, date, and a link back to the original story." />

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
