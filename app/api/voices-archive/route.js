import { NextResponse } from "next/server";
import { getUnifiedArchivePage } from "@/lib/feeds/unifiedArchive.service";
import { rateLimitedResponse } from "@/lib/server/rateLimit";
import { normalizeTelescreenQuery } from "@/lib/telescreen";

export async function GET(request) {
  const limited = rateLimitedResponse("voices-archive", request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const normalized = normalizeTelescreenQuery({
    mode: searchParams.get("mode"),
    source: searchParams.get("source"),
    voice: searchParams.get("voice"),
    artist: searchParams.get("artist"),
  });

  const filters = {};
  if (normalized.sourceType) filters.sourceType = normalized.sourceType;
  if (normalized.voice) filters.voiceSlug = normalized.voice;
  if (normalized.artist) filters.artistSlug = normalized.artist;

  try {
    const result = await getUnifiedArchivePage(page, limit, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Voices archive API error:", error);
    return NextResponse.json({ items: [], hasMore: false, total: 0 }, { status: 500 });
  }
}
