import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import IntelTabs from "@/components/IntelTabs";
import VoicesArchiveContent from "./VoicesArchiveContent.server";
import { buildPageMetadata } from "@/lib/metadata";
import { buildTelescreenHref, normalizeTelescreenQuery, TELESCREEN_MODES } from "@/lib/telescreen";

export const revalidate = 120;

export const metadata = buildPageMetadata({
  title: "Telescreen | I AM [RESIST]",
  description:
    "Curated commentary video, protest music, and media from the catalog - the wall-mounted feed. For creator text feeds, see Intel > Voices.",
  urlPath: "/telescreen",
});

function LibraryDestinations() {
  return (
    <section className="border-t border-border/60 pt-6 sm:pt-8">
      <div className="machine-panel border border-border relative overflow-hidden">
        <div className="absolute inset-0 hud-grid opacity-10" />
        <div className="relative z-10 p-5 sm:p-6 space-y-5">
          <div className="space-y-2">
            <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block">
              Off-screen library
            </span>
            <p className="text-xs sm:text-sm text-foreground/70 uppercase tracking-wider">
              Books, reading notes, and reference material live beside Telescreen now, not inside its media filter.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/book-club"
              className="machine-panel border border-border p-5 hover:border-primary/60 transition-colors"
            >
              <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block mb-2">
                Book Club
              </span>
              <h2 className="section-title text-xl font-bold text-foreground mb-2">Books and reading journal</h2>
              <p className="prose-copy text-foreground/70">
                Browse the current shelf and jump into book-specific journal entries without muddying the media feed.
              </p>
            </Link>

            <Link
              href="/resources"
              className="machine-panel border border-border p-5 hover:border-primary/60 transition-colors"
            >
              <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block mb-2">
                Resources
              </span>
              <h2 className="section-title text-xl font-bold text-foreground mb-2">Curated references and tools</h2>
              <p className="prose-copy text-foreground/70">
                Keep the manifest of guides, organizations, and educational material in its own destination.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function TelescreenPage({ searchParams }) {
  const params = typeof searchParams?.then === "function" ? await searchParams : searchParams ?? {};
  const normalized = normalizeTelescreenQuery(params);

  if (normalized.redirectPath) {
    redirect(normalized.redirectPath);
  }

  if (params.source && !params.mode) {
    redirect(
      buildTelescreenHref({
        mode: normalized.mode,
        voice: normalized.voice,
        artist: normalized.artist,
      })
    );
  }

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
        <IntelTabs description="Curated video and audio from the catalog. Switch directly between curated videos, dissenting voices, and protest music. For creator text feeds, see Intel > Voices." />

        <Suspense fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading archive...</p>}>
          <VoicesArchiveContent
            filters={{
              sourceType: normalized.sourceType || undefined,
              voiceSlug: normalized.voice || undefined,
              artistSlug: normalized.artist || undefined,
            }}
            currentVoice={normalized.voice}
            currentMode={normalized.mode || TELESCREEN_MODES.curated}
            currentArtist={normalized.artist}
          />
        </Suspense>

        <LibraryDestinations />
      </div>
    </main>
  );
}
