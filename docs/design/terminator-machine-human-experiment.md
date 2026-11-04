# Machine / human design experiment

Branch: `feat/terminator-machine-human-design`

The machinery gives the site its atmosphere. The journalism gives it its purpose.

This is a presentational experiment. It does not change Notion publishing, ingestion, ranking, source classification, or event data. It is not a franchise interface: no skulls, no Skynet marks, no threat scores, no sound, and no invented live data.

## Visual principles

Two languages share one site.

**Observation.** Heavy void and gunmetal fields, cold cyan structure, chrome type, and a spare signal red. Geometry frames things. It does not decorate them. This language is for the homepage masthead, Intel, the newswire-side feed panels, and the source monitor.

**The human record.** Condensed editorial headlines, readable body copy, dates, authorship, and source citation. Red is a rule, not a reticle. This language is for the Journal and the Timeline.

Light mode stays the Resistance Press: warm paper, black type, brand red. The homepage masthead remains a dark command surface in both themes, which is the existing `hud-stage` behavior. Observation tokens switch to paper, steel, and the brand red when the light theme is on.

Brand red (`--antifa-red`) is unchanged. The new tokens sit beside it.

| Token | Dark | Light |
|---|---|---|
| Void | `#080A0D` | `#F7F3EB` |
| Gunmetal | `#131C27` | `#FFFDFA` |
| Steel | `#33485C` | `#6D6258` |
| Cyan | `#8BA9BC` | `#3E5163` |
| Chrome | `#E3E9E8` | `#171717` |
| Signal | `#F04444` | `#B91C24` |

## What changed

### Foundations

- Semantic tokens in `app/globals.css`: `--obs-*` for observation surfaces and `--human-rule` / `--human-meta` for the record.
- Shared classes: `signal-stage`, `signal-plate`, `signal-frame`, `human-band`, `obs-desk`, `obs-overview`, `obs-table`, `obs-card`, `obs-status`, `obs-readout`.
- `app/intel/layout.jsx` applies `obs-desk` to Intel routes. Homepage field channels use the same class. The essay band between them uses `human-band`.

### Homepage hero

- `app/page.jsx`, `components/home/HudOverlay.jsx`, `components/home/RotatingWord.jsx`
- "I AM" and the bracketed word stack as a title sequence. The word keeps the width of `[SOLIDARITY]`, so shorter words do not shift the layout.
- The flag sits inside a registration frame. Corner marks and a baseline sit around the image. The old dashed rings and crosshair ticks are gone. The continuous scan sweep is no longer applied to the hero.
- The rotating word still changes. Most changes are a clean swap. A short blink happens every fourth change, on an 8–16 second interval. `prefers-reduced-motion` keeps the first word, `RESIST`.
- Mission copy, the flag, the about link, the featured-essay link, section order, and feed behavior are unchanged.

### Source Transparency

- `components/intel/SourcesAuditSection.jsx`
- `lib/design/sourceOverview.js` counts the health and status values the audit already assigned.
- The page states that source health describes intake status and does not verify claims.
- Desktop is a fixed table: status, source, latest success, item counts, and seven-day treatment. "Full record" opens the endpoint, enablement, notes, and the rest of the timestamps.
- Below the `lg` breakpoint the table is hidden and each source is a card with the same fields. Failure text stays visible without opening anything.
- No confidence percentages, threat labels, or fabricated scan results.

### Journal

- `app/(site)/journal/journal.css`, `components/journal/ArchiveHero.jsx`, `components/journal/JournalArticle.jsx`
- Barlow Condensed and Source Sans 3 stay. The featured title is larger. The metadata rail is narrower and marked "Journal record". Section rules use a short red segment instead of HUD chrome.
- No reticles, scan lines, or looping motion in the reading view.
- Essay selection, images, captions, and source links are unchanged.

### Timeline

- `app/(site)/timeline/page.jsx`, `app/(site)/timeline/timeline.css`, `components/sections/TimelineSection.jsx`
- The masthead uses the journal display face. A square tick and a vertical rule mark sequence. Category color is only a visual distinction among the four existing Brennan categories.
- Event text, category anchors, source URLs, and the Brennan Center attribution are unchanged. The page does not draw arrows or other causal links between events.
- The count ("47 documented events" in the current dataset) comes from `summarizeTimeline()`.

## Screenshots

Captured locally at about 375, 768, and 1440 in light and dark. Phone-width shots show the layout in the left portion of a wider capture.

- `docs/design/screenshots/home-dark-1440.png`
- `docs/design/screenshots/home-light-1440-v2.png`
- `docs/design/screenshots/home-dark-375.png`
- `docs/design/screenshots/sources-light-1440.png`
- `docs/design/screenshots/sources-light-375.png`
- `docs/design/screenshots/journal-light-375.png`
- `docs/design/screenshots/journal-article-1440.png`
- `docs/design/screenshots/timeline-light-1440.png`
- `docs/design/screenshots/timeline-events-light-1440.png`
- `docs/design/screenshots/timeline-dark-375.png`

Checked during review:

- No horizontal overflow on the homepage, source monitor, journal, essay, or timeline at 375 and 1440.
- Featured essay image remained visible, and the essay link opened `/journal/what-the-hell-do-we-do-if-we-win`.
- Source rows used live audit values. In this local session all 23 listed sources were `stale`, with real success dates and item counts. That is intake data, not a new classification.
- The "Targeting Officials" category anchor scrolled to the matching event.
- Timeline source links still point at the Brennan Center timeline.

## Deliberately left out

- A design-mode toggle, route split, or preview flag. The branch is the comparison.
- Changes to ranking, ingestion, Notion, or Supabase.
- Sound, skulls, franchise logos, simulated threat ratings, and fake verification.
- HUD treatment inside the essay.
- A rewrite of every Intel desk. Shared `obs-desk` styling tints existing panels. The information architecture is the same.
- New dependencies.

## Pass 2

The hero and the editorial band were rebuilt, and the two languages now share components instead of one-off page styles.

### Hero

`I AM` and the rotating word are separate line boxes. The identity line uses `line-height: 1.34` and the word uses `1.24`, with a `0.16em` flex gap between them. That replaced `line-height: 0.84` and `gap: 0.08em`, which let the glyphs overlap by about 19px.

Both lines start at the same left edge. The word slot still reserves `[SOLIDARITY]`, so shorter words do not move the mission copy. The type size comes from the title column (`11.4cqi`), which keeps `[SOLIDARITY]` inside the column. The word list, the timer, and reduced-motion behavior are unchanged.

The flag is no longer a landscape image inset 18% inside a square. It fills a registration plate in a column slightly wider than the title. At 1440px the image is about 650×363. Corner marks sit in the plate padding around it.

Measured in the browser with no horizontal overflow. The table is from the dark layout. Light mode was checked at 375 and 1440; the type metrics do not depend on the theme.

| Width | Word size | Glyph gap | `[SOLIDARITY]` past the stage |
|---|---|---|---|
| 375 | 36px | 9px | inside |
| 768 | 76px | 19px | inside |
| 1024 | 44px | 11px | inside |
| 1440 | 64px | 16px | inside |
| 1640 | 73px | 17px | inside |

Stage height and the mission line did not move when the word changed among `[SOLIDARITY]`, `[FREE]`, `[ALLY]`, and `[RESIST]`. The same check covered the rest of the word list at 1440. Left edges matched.

### Editorial transition

The journal band opens with a "Journal" eyebrow and the existing essay label. The featured essay is a lead with a red rule, a metadata line, and a separated title. The latest essay and recent list sit in a rail. Featured selection, images, titles, dates, and links are unchanged.

Below that, live briefing and the homepage Telescreen share `obs-section-head`. Curated articles and the culture block use the record head, so the page moves from the signal, to the essay, back to observation, then to culture and the shop.

Display headlines that were tighter than the font's glyphs now use a line height that keeps wrapped lines apart. That includes the homepage lead and the journal and timeline titles.

### Where the styles live

`app/globals.css` keeps tokens and the older machine-panel layer. Pass 2 moved the experiment rules out:

- `app/design/observation.css` — signal stage, hero, Intel desk, source monitor, observation masts
- `app/design/record.css` — journal band, record and commerce masts, record panels, homepage rail

`components/design/PageMast.jsx` is the shared page header. Variants are `observation`, `record`, and `commerce`.

### Coverage

| Surface | Language | Notes |
|---|---|---|
| Navigation, footer, document strip | Site chrome | Already on chrome tokens. Left as furniture. |
| Homepage hero | Observation | Rebuilt. Stays a dark command surface in both themes. |
| Homepage essays | Record | Lead plus rail. |
| Homepage briefing and Telescreen lane | Observation | Shared section head. |
| Homepage culture | Record inset | Music and the shelf card stay usable. |
| Homepage shop promo and `/shop` | Commerce | Product, price, and cart stay primary. Header uses the commerce mast. |
| Telescreen | Observation mast, functional archive | Filters and players are unchanged. |
| Intel Newswire, OSINT, Watchdogs, item pages | Observation | `obs-desk` plus a shared Intel mast. |
| Source Transparency | Observation | Existing audit table. No new statuses. |
| Curated articles | Record | Archive and article pages use the record title and panel. |
| Resources | Record | HUD grids removed from the shelf cards. |
| Journal archive and essays | Record | Existing journal system. Headline leading loosened so wrapped titles do not collide. |
| Timeline | Record | Mast styles now come from `record.css`. Event text and sources unchanged. |
| About, About This Journal | Record | Manifesto uses the record mast. The personal statement keeps its own reading layout. |
| Book Club and reading notes | Record | Shelf, book, and note pages. No intake theater. |
| Music and curated video pages | Functional media | Player and metadata stay primary. |
| Legal | Record | Disclaimers read as documents. |
| Orders and cart | Commerce | Unchanged purchasing flow. |

Deliberately not restyled into a HUD: shop cards, cart, the essay body, the statement page, and media players.

### Pass 2 screenshots

Browser captures. Wide shots are the left portion of a 1440px layout. Geometry checks used the full viewport.

- `docs/design/screenshots/pass2-before-home-dark-1440.png`
- `docs/design/screenshots/pass2-before-home-essays-dark-1440.png`
- `docs/design/screenshots/pass2-home-hero-dark-1440.png`
- `docs/design/screenshots/pass2-home-essays-dark-1440.png`
- `docs/design/screenshots/pass2-home-light-1440.png`
- `docs/design/screenshots/pass2-home-light-375.png`
- `docs/design/screenshots/pass2-telescreen-light-1440.png`
- `docs/design/screenshots/pass2-intel-light-1440.png`
- `docs/design/screenshots/pass2-journal-light-1440.png`
- `docs/design/screenshots/pass2-timeline-light-1440.png`

## Known limits

- The homepage word still changes on a timer. Reduced motion stops it. There is no sound.
- Short rotating words leave empty space to the right because the line reserves `[SOLIDARITY]`.
- Source health colors mean operational state only. The disclaimer is the guard against reading them as verification.
- Light-theme observation status colors reuse the existing amber and dark-red text colors so stale and failing stay distinct on paper.
- Light-theme observation pages use paper and steel. Only the homepage signal stage stays dark in both themes.
- `npm run typecheck` still reports existing errors in `tests/protestMusicMore.test.ts` and `tests/intel/retireIntelVoices.test.ts`. This branch does not touch those files.

## How to compare

```bash
git fetch origin
git switch feat/terminator-machine-human-design
npm run dev
```

Open `/`, `/intel/sources`, `/journal`, and `/timeline`. Compare with `main` by switching branches. Do not merge or deploy this branch until the design has been reviewed.
