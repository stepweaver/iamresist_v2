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
  title: "Telescreen | I AM [RESIST]",
  description:
    "Voices of Dissent by default, with curated videos and protest music available as direct Telescreen modes.",
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
        <IntelTabs description="Telescreen opens on Voices of Dissent by default. Switch directly between voices, curated videos, and protest music." />

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