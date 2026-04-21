function parseAbsoluteUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function hostMatches(hostname, suffixes) {
  if (!hostname) return false;
  return suffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function looksLikeDocumentUrl(url) {
  const parsed = parseAbsoluteUrl(url);
  const hostname = parsed?.hostname?.toLowerCase() || '';
  const pathname = parsed?.pathname?.toLowerCase() || '';

  if (pathname.endsWith('.pdf')) return true;
  if (hostMatches(hostname, ['docs.google.com', 'documentcloud.org'])) return true;
  return false;
}

function looksLikeVideoUrl(url) {
  const parsed = parseAbsoluteUrl(url);
  const hostname = parsed?.hostname?.toLowerCase() || '';

  return hostMatches(hostname, [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'rumble.com',
    'tiktok.com',
    'instagram.com',
  ]);
}

function looksLikeRecordUrl(url) {
  const parsed = parseAbsoluteUrl(url);
  const hostname = parsed?.hostname?.toLowerCase() || '';

  return hostMatches(hostname, [
    'courtlistener.com',
    'congress.gov',
    'ecfr.gov',
    'federalregister.gov',
    'govinfo.gov',
    'regulations.gov',
    'supremecourt.gov',
  ]);
}

function withArrow(label, enabled) {
  return enabled ? `${label} ->` : label;
}

export function getIntelSourceLinkLabel(row, { withTrailingArrow = false } = {}) {
  const url = row?.canonicalUrl;

  if (row?.deskLane === 'voices' || looksLikeVideoUrl(url)) {
    return withArrow('Watch video', withTrailingArrow);
  }

  if (row?.contentUseMode === 'metadata_only') {
    if (looksLikeDocumentUrl(url)) return withArrow('Open document', withTrailingArrow);
    if (looksLikeRecordUrl(url)) return withArrow('Open record', withTrailingArrow);
    return withArrow('Open source', withTrailingArrow);
  }

  if (looksLikeDocumentUrl(url)) {
    return withArrow('Read document', withTrailingArrow);
  }

  return withArrow('Read article', withTrailingArrow);
}

export function getVoiceSourceLinkLabel(item, { withTrailingArrow = false } = {}) {
  const label = item?.isProtestMusic ? 'Open song' : 'Watch video';
  return withArrow(label, withTrailingArrow);
}
