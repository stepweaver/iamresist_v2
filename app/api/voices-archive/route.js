import { NextResponse } from "next/server";
import { getUnifiedArchivePage } from "@/lib/feeds/unifiedArchive.service";
import { rateLimitedResponse } from "@/lib/server/rateLimit";

export async function GET(request) {
  const limited = rateLimitedResponse("voices-archive", request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const source = searchParams.get("source") || undefined;
  const voice = searchParams.get("voice") || undefined;
  const artist = searchParams.get("artist") || undefined;

  const filters = {};
  if (source) filters.sourceType = source;
  if (voice) filters.voiceSlug = voice;
  if (artist) filters.artistSlug = artist;

  try {
    const result = await getUnifiedArchivePage(page, limit, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Voices archive API error:", error);
    return NextResponse.json({ items: [], hasMore: false, total: 0 }, { status: 500 });
  }
}
