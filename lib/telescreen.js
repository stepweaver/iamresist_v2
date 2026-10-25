export const TELESCREEN_MODES = {
  curated: "curated-videos",
  voices: "voices",
  music: "protest-music",
};

export const DEFAULT_TELESCREEN_MODE = TELESCREEN_MODES.voices;

export const TELESCREEN_FEED_STATUS = {
  ok: "ok",
  empty: "empty",
  unavailable: "unavailable",
  invalid: "invalid",
};

export const TELESCREEN_MODE_OPTIONS = [
  { value: TELESCREEN_MODES.voices, label: "Voices of Dissent" },
  { value: TELESCREEN_MODES.curated, label: "Curated Videos" },
  { value: TELESCREEN_MODES.music, label: "Protest Music" },
];

const LEGACY_SOURCE_REDIRECTS = {
  books: "/book-club",
  resources: "/resources",
  journal: "/journal",
};

const LEGACY_SOURCE_TO_MODE = {
  voices: TELESCREEN_MODES.voices,
  "curated-videos": TELESCREEN_MODES.curated,
  "protest-music": TELESCREEN_MODES.music,
};

const VALID_MODES = new Set(Object.values(TELESCREEN_MODES));

function sanitizeSingle(value) {
  if (Array.isArray(value)) return sanitizeSingle(value[0]);
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function normalizeTelescreenQuery(input = {}) {
  const modeParam = sanitizeSingle(input.mode);
  const sourceParam = sanitizeSingle(input.source);
  const voiceParam = sanitizeSingle(input.voice);
  const artistParam = sanitizeSingle(input.artist);

  if (sourceParam && LEGACY_SOURCE_REDIRECTS[sourceParam]) {
    return {
      redirectPath: LEGACY_SOURCE_REDIRECTS[sourceParam],
      mode: null,
      voice: null,
      artist: null,
      canonicalQuery: "",
      sourceType: undefined,
    };
  }

  const legacyMode = sourceParam ? LEGACY_SOURCE_TO_MODE[sourceParam] : null;
  const mode = VALID_MODES.has(modeParam)
    ? modeParam
    : legacyMode || DEFAULT_TELESCREEN_MODE;

  const voice = mode === TELESCREEN_MODES.voices ? voiceParam : null;
  const artist = mode === TELESCREEN_MODES.music ? artistParam : null;

  const query = new URLSearchParams();

  if (mode !== DEFAULT_TELESCREEN_MODE) query.set("mode", mode);
  if (voice) query.set("voice", voice);
  if (artist) query.set("artist", artist);

  return {
    redirectPath: null,
    mode,
    voice,
    artist,
    canonicalQuery: query.toString(),
    sourceType: mode,
  };
}

export function telescreenCollectionMessage(mode, feedStatus) {
  if (feedStatus === TELESCREEN_FEED_STATUS.unavailable) {
    if (mode === TELESCREEN_MODES.curated) return "Curated videos are temporarily unavailable.";
    if (mode === TELESCREEN_MODES.music) return "Protest music is temporarily unavailable.";
    return "This feed is temporarily unavailable.";
  }
  if (feedStatus === TELESCREEN_FEED_STATUS.invalid) {
    return "This feed configuration is invalid.";
  }
  if (mode === TELESCREEN_MODES.curated) return "No curated videos are available right now.";
  if (mode === TELESCREEN_MODES.music) return "No protest music matches the current filters.";
  return "No video items available.";
}

export function telescreenDirectoryMessage(directoryFailed) {
  return directoryFailed ? "Voice list is temporarily unavailable." : null;
}

export function buildTelescreenHref({ mode, voice, artist } = {}) {
  const normalized = normalizeTelescreenQuery({ mode, voice, artist });
  if (normalized.redirectPath) return normalized.redirectPath;
  return normalized.canonicalQuery ? `/telescreen?${normalized.canonicalQuery}` : "/telescreen";
}