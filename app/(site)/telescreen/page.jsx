import { Suspense } from "react";
import { redirect } from "next/navigation";
import PageMast from "@/components/design/PageMast";
import VoicesArchiveContent from "./VoicesArchiveContent.server";
import { buildPageMetadata } from "@/lib/metadata";
import {
  buildTelescreenHref,
  DEFAULT_TELESCREEN_MODE,
  normalizeTelescreenQuery,
} from "@/lib/telescreen";

export const revalidate = 120;

function sanitizeRefresh(value) {
  if (Array.isArray(value)) return sanitizeRefresh(value[0]);
  if (value == null) return "";
  return String(value).trim();
}

export const metadata = buildPageMetadata({
  title: "Telescreen Political Video Archive and Voices of Dissent",
  description:
    "Political video, voices of dissent, and protest music.",
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
      className="hero-page-bg min-h-screen overflow-x-clip"
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <PageMast
          variant="observation"
          kicker="Telescreen"
          title="Political Video Archive and Voices of Dissent"
          lede="Political video, voices of dissent, and protest music."
        />

        <Suspense fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading archive...</p>}>
          <VoicesArchiveContent
            filters={{
              sourceType: normalized.sourceType || undefined,
              voiceSlug: normalized.voice || undefined,
              artistSlug: normalized.artist || undefined,
            }}
            refresh={Boolean(sanitizeRefresh(params.refresh))}
            currentVoice={normalized.voice}
            currentMode={normalized.mode || DEFAULT_TELESCREEN_MODE}
            currentArtist={normalized.artist}
          />
        </Suspense>
      </div>
    </main>
  );
}
