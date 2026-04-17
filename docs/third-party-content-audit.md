# Third-Party Content Audit

Last updated: April 17, 2026

## Scope

This pass audits how `iamresist_v2` currently uses third-party content in the public site and identifies higher-risk usage patterns for follow-up review. It is an engineering and policy-copy artifact, not a legal opinion.

Primary files reviewed:

- `app/(site)/legal/page.jsx`
- `components/layout/Footer.jsx`
- `app/(site)/about/page.jsx`
- `components/voices/VoiceCard.jsx`
- `components/voices/InlinePlayerModalClean.jsx`
- `components/intel/LiveDeskView.jsx`
- `components/newswire/NewswireImage.jsx`
- `components/newswire/NewswireImageBlock.jsx`
- `lib/newswire.js`
- `lib/feeds/feedItemImage.js`
- `lib/feeds/ogImage.js`
- `lib/feeds/newswireImage.js`
- `lib/feeds/liveIntel.service.js`
- `lib/intel/fetchText.ts`

Additional related surfaces reviewed:

- `components/newswire/RemoteCoverImage.jsx`
- `components/newswire/NewswireHeadlineCard.jsx`
- `components/home/HomeLiveBriefingSection.jsx`
- `app/intel/newswire/page.jsx`
- `app/intel/voices/page.jsx`
- `app/(site)/curated/[slug]/page.jsx`
- `app/(site)/music/[slug]/page.jsx`
- `app/(site)/telescreen/page.jsx`
- `lib/voices.js`
- `next.config.mjs`

## Current Behavior Summary

### 1. Embedded video and audio

- The site embeds YouTube players in creator and catalog surfaces.
- `components/voices/InlinePlayerModalClean.jsx` uses `https://www.youtube-nocookie.com/embed/...` for inline playback inside the modal.
- `app/(site)/curated/[slug]/page.jsx` and `app/(site)/music/[slug]/page.jsx` use `https://www.youtube.com/embed/...` on item detail pages.
- `next.config.mjs` explicitly allows YouTube and `youtube-nocookie` in CSP `frame-src` and `connect-src`.
- Voices page copy already says "text and audio from public feeds" in `app/intel/voices/page.jsx`, but most actual inline embed behavior observed in this pass is video-oriented rather than native audio player embedding.

### 2. Source headlines

- Newswire cards display source headline text from feeds in `components/newswire/NewswireHeadlineCard.jsx`.
- Intel/live desk cards display source titles from ingested items in `components/intel/LiveDeskView.jsx` and `components/home/HomeLiveBriefingSection.jsx`.
- Calls to action consistently route users to source pages via external links.

### 3. Source snippets, descriptions, and short previews

- `lib/newswire.js` derives `excerpt` from feed item descriptions, strips HTML, and truncates to 200 characters.
- Curated Notion-backed newswire entries store a site-authored `note` from `article.description`, truncated to 400 characters in `lib/newswire.js`.
- `components/newswire/NewswireHeadlineCard.jsx` labels those site-authored notes as `Editorial note`.
- `components/intel/LiveDeskView.jsx` shows `row.summary` when `contentUseMode !== 'metadata_only'`, truncating previews for display.
- `components/voices/VoiceCard.jsx` shows item `description`; if the item is curated or protest music it is labeled `Editorial note`, otherwise it can appear as feed text without a separate label.
- `components/voices/InlinePlayerModalClean.jsx` renders `item.description` in the modal body below the embedded player.

### 4. Source images, OG images, and feed images

- The site renders remote images directly with plain `<img>` tags in `components/newswire/NewswireImage.jsx` and `components/voices/VoiceCard.jsx`.
- `components/newswire/RemoteCoverImage.jsx`, `components/newswire/NewswireImageBlock.jsx`, `components/intel/LiveDeskView.jsx`, and `components/home/HomeLiveBriefingSection.jsx` all depend on externally hosted image URLs.
- `lib/feeds/feedItemImage.js` extracts image URLs from RSS enclosures, media tags, HTML image tags, srcset values, and OG/Twitter image metadata embedded in feed content.
- `lib/feeds/ogImage.js` fetches article HTML directly, parses OG/Twitter image tags, and can use those remote images as display images.
- `lib/feeds/liveIntel.service.js` can backfill missing desk imagery from source OG images when `INTEL_DESK_OG_FALLBACK=1`.
- `lib/newswire.js` can backfill missing newswire images from OG images when `NEWSWIRE_OG_FALLBACK=1`.
- `lib/feeds/newswireImage.js` and `lib/feeds/feedItemImage.js` already include some quality and skip rules, but those are image-quality filters, not rights filters.

### 5. External links

- External canonical/source links are used throughout the site with `target="_blank"` and `rel="noopener noreferrer"`.
- Newswire cards link to both the original article and, where configured, a publication support/subscription URL.
- Intel/Voices surfaces repeatedly use "Read / listen at source", "Read at source", "Open canonical", and "Open source" language.

### 6. User-facing commentary attached to third-party items

- `components/newswire/NewswireHeadlineCard.jsx` can attach site-authored editorial notes to curated articles.
- `components/voices/VoiceCard.jsx` shows a `Commentary` chip for voices and curated videos and labels some descriptions as `Editorial note`.
- `components/intel/LiveDeskView.jsx` displays `whyItMatters`, trust notes, deterministic explanations, and transparency labels alongside linked third-party items.
- `lib/intel/whyItMatters.ts` explicitly distinguishes commentary from primary evidence.

### 7. Source fetch behavior worth disclosing

- `lib/intel/fetchText.ts` performs server-side fetches against public URLs with a custom user agent and follows redirects manually for ingest and parsing.
- `lib/feeds/ogImage.js` fetches source article HTML to inspect metadata and image candidates.
- Remote image rendering is effectively hotlinking from the publisher/platform host unless the asset is later replaced by a site-owned file.
- Embedded players and remote images cause direct browser requests to third-party infrastructure when loaded by the user.

## Risk Categories

## `low_risk_keep`

These patterns are comparatively low risk and consistent with the site's stated mission if attribution and policy copy remain accurate.

- Headline-plus-link presentation of source items.
  - Examples: `components/newswire/NewswireHeadlineCard.jsx`, `components/intel/LiveDeskView.jsx`
- Short feed-derived previews and metadata-only linking.
  - Examples: `lib/newswire.js`, `components/intel/LiveDeskView.jsx`
- Clear labels separating site commentary from source material.
  - Examples: `Editorial note` and `Commentary` labels in `components/newswire/NewswireHeadlineCard.jsx` and `components/voices/VoiceCard.jsx`
- Source/support links that drive users back to original publishers.
  - Examples: `Read at source`, `Open canonical`, `Support` CTAs

## `medium_risk_review`

These patterns are plausible to keep, but they deserve tightening, clearer standards, or a narrower implementation policy.

- Unlabeled feed descriptions shown as body copy when they are not site-authored.
  - Example: non-curated `description` handling in `components/voices/VoiceCard.jsx` and `components/voices/InlinePlayerModalClean.jsx`
- Feed-derived summaries displayed in the intel desk without a visible "source preview" label on every card.
  - Example: `row.summary` display in `components/intel/LiveDeskView.jsx`
- Mixed treatment of embeds across the site.
  - Example: modal uses `youtube-nocookie`, while curated/music detail pages use `youtube.com/embed`
- Server-side source HTML fetching with browser-like headers.
  - Example: `lib/intel/fetchText.ts`, `lib/feeds/ogImage.js`

## `high_risk_restrict_or_remove`

These are the strongest candidates for follow-up restrictions or removals if the project wants a more conservative third-party content posture.

- Remote publisher image hotlinking at scale across newswire, intel, and briefing surfaces.
  - Examples: `components/newswire/NewswireImage.jsx`, `components/newswire/RemoteCoverImage.jsx`, `components/intel/LiveDeskView.jsx`, `components/home/HomeLiveBriefingSection.jsx`
- OG-image backfill that fetches article HTML and then displays publisher-hosted imagery that was not necessarily supplied in the public feed item.
  - Examples: `lib/feeds/ogImage.js`, `lib/newswire.js`, `lib/feeds/liveIntel.service.js`
- Source-page detail views that place a third-party embedded media player directly adjacent to site-authored editorial notes.
  - Examples: `app/(site)/curated/[slug]/page.jsx`, `app/(site)/music/[slug]/page.jsx`

## Inspectable Examples by Surface

### Newswire

- Uses headline, source, date, excerpt, remote image, and optional support link.
- Main code paths:
  - `lib/newswire.js`
  - `components/newswire/NewswireHeadlineCard.jsx`
  - `components/newswire/NewswireImage.jsx`
  - `components/newswire/NewswireImageBlock.jsx`
  - `lib/feeds/ogImage.js`

### Intel / Live desks

- Uses source title, canonical link, source name, date, short summary, deterministic commentary (`whyItMatters`), trust warnings, and optional remote image.
- Main code paths:
  - `components/intel/LiveDeskView.jsx`
  - `components/home/HomeLiveBriefingSection.jsx`
  - `lib/feeds/liveIntel.service.js`
  - `lib/intel/fetchText.ts`

### Voices / Telescreen / Catalog

- Uses creator/platform labels, source links, YouTube thumbnails, inline YouTube embeds, and item descriptions that may be either feed-derived text or site-authored notes depending on source type.
- Main code paths:
  - `components/voices/VoiceCard.jsx`
  - `components/voices/InlinePlayerModalClean.jsx`
  - `app/(site)/curated/[slug]/page.jsx`
  - `app/(site)/music/[slug]/page.jsx`
  - `lib/voices.js`

## Follow-Up Recommendations

1. Standardize excerpt labeling.
   - Add a visible label such as `Source preview` or equivalent anywhere feed-derived descriptions or summaries are rendered as body copy.

2. Narrow embed host policy.
   - Move curated/music detail pages to `youtube-nocookie.com` to match the inline modal unless there is a strong product reason not to.

3. Review remote-image usage surface-by-surface.
   - Decide whether remote newswire/intel images remain acceptable, become opt-in by source, or are removed from higher-risk lanes first.

4. Consider disabling OG-image fallback before disabling feed-native images.
   - OG backfill is a stronger rights and provenance risk than using the image already present in a public feed item.

5. Add source-level policy controls for images.
   - The code already has technical skip rules; a follow-up pass could add editorial/legal allowlists or deny-lists by source family.

6. Separate site commentary from third-party media a bit more explicitly on detail pages.
   - Keep the feature, but consider a short disclosure near embeds where editorial notes sit directly below platform-hosted media.

7. Create a simple intake checklist for takedown review.
   - At minimum: URL, asset type, claimed rights basis, requested action, and date received.

## Practical Recommendation Order

Recommended first:

1. Standardize source-preview labeling.
2. Move remaining YouTube embeds to `youtube-nocookie`.
3. Gate or disable OG-image fallback where it is not essential.

Recommended second:

4. Add per-source image handling rules.
5. Revisit whether voices feed descriptions should be shown inline for all source types.

Recommended later:

6. Decide whether to proxy/cache licensed-safe images or remove remote image use from selected desks.

## Readiness for Image-Recovery Pass

Yes, with caveats.

The repo is ready for an image-recovery pass in the sense that:

- current behavior is now documented,
- the major risk centers are identified,
- and the next pass can target image handling specifically without first untangling policy language.

Important caveat:

- image recovery should not blindly increase image coverage.
- It should prefer safer ordering such as feed-native image review first, source-level rules second, and OG-image backfill last.
