import { Suspense } from "react";
import { redirect } from "next/navigation";
import IntelTabs from "@/components/IntelTabs";
import VoicesArchiveContent from "./VoicesArchiveContent.server";
import { buildPageMetadata } from "@/lib/metadata";
import {
  buildTelescreenHref,
  DEFAULT_TELESCREEN_MODE,
  normalizeTelescreenQuery,
} from "@/lib/telescreen";

export const revalidate = 120;

export const metadata = buildPageMetadata({
  title: "Telescreen Political Video Archive and Voices of Dissent",
  description:
    "Curated political video archive with voices of dissent, editorial video picks, and protest music collected on one surface.",
  urlPath: "/telescreen",
});

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
        <IntelTabs description="Switch between voices, curated videos, and protest music without leaving the archive." />
        <section className="machine-panel border border-border relative overflow-hidden mb-6 sm:mb-8">
          <div className="absolute inset-0 hud-grid opacity-10" />
          <div className="relative z-10 p-5 sm:p-6 lg:p-8 max-w-4xl">
            <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block mb-2">
              Telescreen
            </span>
            <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              Political Video Archive and Voices of Dissent
            </h1>
            <p className="prose-copy mt-4 max-w-3xl text-base sm:text-lg text-foreground/75 leading-relaxed">
              Telescreen is the site&apos;s video surface: creator feeds,
              curated political videos, and protest music collected in one
              archive. Use the mode switch to move between direct voices,
              editorial picks, and songs tied to the broader resistance record.
            </p>
          </div>
        </section>

        <Suspense fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading archive...</p>}>
          <VoicesArchiveContent
            filters={{
              sourceType: normalized.sourceType || undefined,
              voiceSlug: normalized.voice || undefined,
              artistSlug: normalized.artist || undefined,
            }}
            currentVoice={normalized.voice}
            currentMode={normalized.mode || DEFAULT_TELESCREEN_MODE}
            currentArtist={normalized.artist}
          />
        </Suspense>
      </div>
    </main>
  );
}
