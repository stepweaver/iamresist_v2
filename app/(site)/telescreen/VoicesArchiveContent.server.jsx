import { getAllVoicesCached } from "@/lib/notion/voices.repo";
import { getProtestMusicArtistsCached } from "@/lib/notion/protestMusic.repo";
import { getUnifiedArchivePage } from "@/lib/feeds/unifiedArchive.service";
import { selectTelescreenVoices } from "@/lib/feeds/archiveMedia";
import { TELESCREEN_ARCHIVE_BATCH } from "@/lib/telescreen";
import { loadTelescreenArchiveDeps } from "@/lib/telescreen/loadArchiveDeps";
import { TELESCREEN_FEED_STATUS } from "@/lib/telescreen";
import { timeAsync } from "@/lib/ops/perfTiming";

import VoicesArchiveClient from "./VoicesArchiveClient";

export default async function VoicesArchiveContent({
  filters = {},
  refresh = false,
  currentVoice = null,
  currentMode = null,
  currentArtist = null,
}) {
  const deps = await timeAsync("telescreen-archive", () =>
    loadTelescreenArchiveDeps({
      loadVoices: () => getAllVoicesCached(),
      loadArtists: () => getProtestMusicArtistsCached(),
      loadArchive: () => getUnifiedArchivePage(1, TELESCREEN_ARCHIVE_BATCH, filters, { refresh }),
    })
  );

  if (deps.voicesFailed) console.warn("[telescreen] voices directory failed");
  if (deps.artistsFailed) console.warn("[telescreen] protest music artists failed");

  const voices = selectTelescreenVoices(deps.voices, {
    videoSlugs: deps.archive.videoVoiceSlugs,
    unavailableSlugs: deps.archive.unavailableVoiceSlugs,
    selectedSlug: currentVoice,
  }).sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  const { items, hasMore } = deps.archive;

  return (
    <VoicesArchiveClient
      initialItems={items}
      initialHasMore={hasMore}
      initialFeedStatus={deps.archive.feedStatus || TELESCREEN_FEED_STATUS.ok}
      voicesDirectoryFailed={deps.voicesFailed}
      voices={voices}
      artists={deps.artists}
      currentVoice={currentVoice}
      currentMode={currentMode}
      currentArtist={currentArtist}
    />
  );
}
