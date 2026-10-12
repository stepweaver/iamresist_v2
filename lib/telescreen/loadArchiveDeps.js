/**
 * Independent Telescreen archive reads. The page needs the archive result.
 * A failed directory or artist list degrades that control instead of failing the page.
 */
export async function loadTelescreenArchiveDeps({ loadVoices, loadArtists, loadArchive }) {
  const [voicesResult, artistsResult, archiveResult] = await Promise.allSettled([
    Promise.resolve().then(loadVoices),
    Promise.resolve().then(loadArtists),
    Promise.resolve().then(loadArchive),
  ]);

  if (archiveResult.status === 'rejected') {
    throw archiveResult.reason instanceof Error ? archiveResult.reason : new Error('telescreen_archive_failed');
  }

  return {
    voices: voicesResult.status === 'fulfilled' && Array.isArray(voicesResult.value) ? voicesResult.value : [],
    artists: artistsResult.status === 'fulfilled' && Array.isArray(artistsResult.value) ? artistsResult.value : [],
    archive: archiveResult.value,
    voicesFailed: voicesResult.status === 'rejected',
    artistsFailed: artistsResult.status === 'rejected',
  };
}
