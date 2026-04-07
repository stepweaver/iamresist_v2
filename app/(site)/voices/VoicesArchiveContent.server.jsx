import { getAllVoices } from "@/lib/notion/voices.repo";
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
  const allVoices = await getAllVoices();
  const voices = allVoices.filter((v) => v.enabled && v.feedUrl).sort((a, b) => a.title.localeCompare(b.title));

  // Artists list - not implemented yet
  const artists = [];

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
