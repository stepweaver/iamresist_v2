import { describe, expect, it } from "vitest";
import {
  buildTelescreenHref,
  DEFAULT_TELESCREEN_MODE,
  normalizeTelescreenQuery,
  TELESCREEN_MODES,
} from "@/lib/telescreen";

describe("normalizeTelescreenQuery", () => {
  it("defaults telescreen to Voices of Dissent without extra query params", () => {
    const normalized = normalizeTelescreenQuery({});
    expect(normalized.mode).toBe(DEFAULT_TELESCREEN_MODE);
    expect(normalized.canonicalQuery).toBe("");
    expect(normalized.sourceType).toBe(TELESCREEN_MODES.voices);
  });

  it("maps legacy media source params to the new mode model", () => {
    const normalized = normalizeTelescreenQuery({
      source: "voices",
      voice: "some-creator",
    });

    expect(normalized.mode).toBe(TELESCREEN_MODES.voices);
    expect(normalized.voice).toBe("some-creator");
    expect(normalized.artist).toBeNull();
    expect(normalized.canonicalQuery).toBe("voice=some-creator");
  });

  it("drops irrelevant secondary filters when mode changes", () => {
    const normalized = normalizeTelescreenQuery({
      mode: TELESCREEN_MODES.curated,
      voice: "some-creator",
      artist: "some-artist",
    });

    expect(normalized.voice).toBeNull();
    expect(normalized.artist).toBeNull();
    expect(normalized.canonicalQuery).toBe("mode=curated-videos");
  });

  it("redirects legacy library sources to their dedicated surfaces", () => {
    expect(normalizeTelescreenQuery({ source: "books" }).redirectPath).toBe("/book-club");
    expect(normalizeTelescreenQuery({ source: "resources" }).redirectPath).toBe("/resources");
    expect(normalizeTelescreenQuery({ source: "journal" }).redirectPath).toBe("/journal");
  });
});

describe("buildTelescreenHref", () => {
  it("keeps Voices of Dissent on the clean root URL", () => {
    expect(buildTelescreenHref({ mode: TELESCREEN_MODES.voices })).toBe("/telescreen");
  });

  it("builds readable URLs for voice, curated video, and protest music filters", () => {
    expect(buildTelescreenHref({ mode: TELESCREEN_MODES.voices, voice: "creator-one" })).toBe(
      "/telescreen?voice=creator-one"
    );

    expect(buildTelescreenHref({ mode: TELESCREEN_MODES.curated })).toBe(
      "/telescreen?mode=curated-videos"
    );

    expect(buildTelescreenHref({ mode: TELESCREEN_MODES.music, artist: "artist-one" })).toBe(
      "/telescreen?mode=protest-music&artist=artist-one"
    );
  });
});