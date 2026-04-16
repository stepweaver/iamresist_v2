import { getAllVoicesCached } from "@/lib/notion/voices.repo";
import { getProtestMusicArtists } from "@/lib/notion/protestMusic.repo";
import { getUnifiedArchivePage } from "@/lib/feeds/unifiedArchive.service";
import { VOICES_ARCHIVE_PAGE_SIZE } from "@/lib/constants";

import VoicesArchiveClient from "./VoicesArchiveClient";

export default async function VoicesArchiveContent({
  filters = {},
  currentVoice = null,
  currentSource = null,
  currentArtist = null,
}) {
  // Get all voices for filter dropdown (only enabled ones with feedUrl)
  const voices = (await getAllVoicesCached()).sort((a, b) => a.title.localeCompare(b.title));

  const artists = await getProtestMusicArtists({ limit: 400 });

  // Fetch the first page of archive items
  const { items, hasMore } = await getUnifiedArchivePage(1, VOICES_ARCHIVE_PAGE_SIZE, filters);

  return (
    <VoicesArchiveClient
      initialItems={items}
      initialHasMore={hasMore}
      voices={voices}
      artists={artists}
      currentVoice={currentVoice}
      currentSource={currentSource}
      currentArtist={currentArtist}
    />
  );
}
