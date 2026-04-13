import { Suspense } from "react";
import { redirect } from "next/navigation";
import IntelTabs from "@/components/IntelTabs";
import VoicesArchiveContent from "./VoicesArchiveContent.server";
import BooksSection from "./BooksSection";
import ResourcesSection from "./ResourcesSection";
import { buildPageMetadata } from "@/lib/metadata";

export const revalidate = 120;

export const metadata = buildPageMetadata({
  title: "Telescreen | I AM [RESIST]",
  description:
    "Curated commentary video, protest music, and media from the catalog — the wall-mounted feed. For creator text feeds, see Intel › Voices.",
  urlPath: "/telescreen",
});

export default async function TelescreenPage({ searchParams }) {
  const params = typeof searchParams?.then === "function" ? await searchParams : searchParams ?? {};
  const source = params.source ?? null;
  const voice = params.voice ?? null;
  const artist = params.artist ?? null;

  if (source === "journal") redirect("/journal");

  const isBooksSection = source === "books";
  const isResourcesSection = source === "resources";

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
          description={
            isResourcesSection
              ? "Curated links and educational materials on resistance, democracy, and antifascism."
              : "Curated video and audio from the catalog. For creator text feeds, see Intel › Voices."
          }
        />

        {isBooksSection ? (
          <Suspense fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading…</p>}>
            <BooksSection />
          </Suspense>
        ) : isResourcesSection ? (
          <Suspense fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading…</p>}>
            <ResourcesSection />
          </Suspense>
        ) : (
          <Suspense fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading archive…</p>}>
            <VoicesArchiveContent
              filters={{ sourceType: source || undefined, voiceSlug: voice || undefined, artistSlug: artist || undefined }}
              currentVoice={voice}
              currentSource={source}
              currentArtist={artist}
            />
          </Suspense>
        )}
      </div>
    </main>
  );
}
