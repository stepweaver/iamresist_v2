# Build Plan — I AM [RESIST]

## Batch Structure

Three batches, each small and reviewable. Batch 1 is narrow and foundational. Batches 2 and 3 build on the foundation.

---

## Current rebuild truth

Use this table as **product/doc truth** for what exists vs deferred.

| Capability | State |
|------------|--------|
| Journal (Notion list + `[slug]` + block body) | **Done** |
| Timeline | **Done** — Brennan Center–attributed summary + static `TimelineSection` |
| Voices / Intel | **Partial** — `/voices` RSS feed + cards; no archive filters / player / books / resources (see `01-feature-map.md` §9) |
| `/intel` | **Redirect → `/voices`** (`app/intel/page.jsx`, `permanentRedirect`) |
| `/intel/newswire` | **Done** — `app/intel/newswire/page.jsx` (RSS + Notion curated + source directory) |
| Home hero / mission | **Done** |
| Home field channels | **Done** — `JournalSection`, `VoicesFeedSection`, `NewswireSection` (not source’s single mixed `HomeFeed`) |
| Shop / commerce | **Deferred** — **`/shop` placeholder** only |
| `/resources` | **Missing** |
| Shared content primitives (`PageContainer`, `EmptyState`, etc.) | **Present** |
| Fonts | **`next/font/google`** — build needs Google Fonts network access; explicit runtime `fallback` stacks in `app/fonts.js` |

---

## Batch 1 — Foundation

**Scope**: Project scaffold, visual identity, home page shell

**Goal**: Establish the minimum high-value foundation — a buildable, deployable site with real home page composition, theme system, navigation, and visual identity.

### Deliverables

#### Project Setup
- [x] `package.json` — Next.js 15, React 19, Tailwind v4, essential deps
- [x] `jsconfig.json` — path aliases, module resolution
- [x] `eslint.config.mjs` — ESLint with Next.js config
- [x] `postcss.config.mjs` — Tailwind v4 PostCSS plugin
- [x] `next.config.mjs` — Next.js configuration

#### App Structure
- [x] `app/layout.jsx` — Root layout with fonts, theme provider, metadata
- [x] `app/globals.css` — Theme variables, design tokens, HUD effects, typography roles
- [x] `app/page.jsx` — Home page shell with real composition
- [x] `app/not-found.jsx` — 404 page with resistance aesthetic
- [x] `app/loading.jsx` — Global loading state
- [x] `app/fonts.js` — Font configuration (Orbitron, Rajdhani, IBM Plex Sans, Share Tech Mono)

#### Layout Components
- [x] `components/layout/Navigation.jsx` — Fixed nav with desktop links, mobile menu, theme toggle
- [x] `components/layout/Footer.jsx` — Footer with links, copyright, branding
- [x] `components/layout/DocumentChrome.jsx` — Briefing-packet chrome wrapper
- [x] `components/layout/ThemeProvider.jsx` — Theme state, cookie management, dark/light toggle

#### Shared UI Foundation
- [x] `components/ui/Badge.jsx` — HUD-style badge/tag component
- [x] `components/ui/Divider.jsx` — Section divider with resistance aesthetic
- [x] `components/ui/Stamp.jsx` — Classification stamp component

#### Home Page Components
- [x] `components/home/RotatingWord.jsx` — Animated word rotation (client component)
- [x] `components/home/HudOverlay.jsx` — HUD overlay with title and code

#### Public Assets
- [x] `public/resist_sticker.png` — Hero logo (synced from source repo)
- [x] `public/web-app-manifest-192x192.png`, `public/web-app-manifest-512x512.png` — PWA icons; referenced from `manifest.json`
- [x] `public/manifest.json` — Web app manifest (icons + theme aligned with rebuild)

### What This Covers
- Site is buildable and deployable
- Home page has real composition (hero, rotating word, HUD overlay, mission statement)
- Navigation works (desktop + mobile)
- Theme toggle works (dark/light with cookie persistence)
- Visual identity is established (military/HUD/document aesthetic)
- 404 page exists with themed design
- Loading state exists

### What Batch 1 originally did not cover
*Historical scope only — the repo has since gained journal, timeline, legal, and more. See **Current rebuild truth** above.*

- No CMS, feeds, or commerce in the **Batch 1 charter**
- No API routes, webhooks, cron, or analytics in the **Batch 1 charter**

### Success Criteria
- `npm install` succeeds
- `npm run build` succeeds with no errors
- `npm run lint` passes
- Home page renders with hero, rotating word, HUD overlay
- Navigation links work (even if pages are stubs)
- Theme toggle switches between dark and light
- Mobile menu opens/closes
- 404 page renders for unknown routes

---

## Batch 2A — Content Route Shells

**Scope**: Route shells and page architecture for content pages, shared primitives, metadata, loading/empty states.

**Goal**: Establish the route structure and page templates for content pages without full data integration. Create honest placeholders that clearly signal forthcoming content.

**Reality check**: Journal, timeline, voices feed, newswire, and home sections are **live**. Batch 2A checkboxes below are historical; see **Current rebuild truth** for done vs partial.

### Deliverables

#### Route Structure
- [ ] `app/(site)/layout.jsx` — Shared layout for content pages (optional; rebuild still uses root layout only)
- [x] `app/(site)/about/page.jsx` — Mission/About page
- [x] `app/(site)/voices/page.jsx` — Voices/intel **RSS listing** (`getVoicesFeed`, Notion voice registry)
- [x] `app/(site)/journal/page.jsx` — Journal listing **with live Notion data** when env is configured
- [x] `app/(site)/journal/[slug]/page.jsx` — Entry detail **with Notion blocks** (not originally in 2A scope)
- [x] `app/(site)/timeline/page.jsx` — Timeline **with source-grounded copy** + interactive section
- [x] `app/(site)/legal/page.jsx` — Legal/disclaimer page
- [x] `app/(site)/shop/page.jsx` — **Honest placeholder** for Supply (no commerce); nav `/shop` resolves

#### Shared Content Primitives
- [ ] `components/content/SectionHeader.jsx` — Styled section titles with HUD aesthetic
- [x] `components/content/EmptyState.jsx` — Empty state placeholder component
- [ ] `components/content/LoadingState.jsx` — Content loading skeleton (reusable)
- [x] `components/content/PageContainer.jsx` — Standard page container with consistent padding/width

#### Metadata
- [x] Per-page `export const metadata` on about, voices, journal, timeline, legal, shop placeholder
- [x] Basic SEO titles and descriptions (journal detail uses `generateMetadata`)

### What This Covers
- Content routes listed in **Current rebuild truth** are accessible and render
- Consistent page layout and design language
- Loading states for async content
- Empty states for no-data scenarios
- Proper metadata for SEO
- Placeholder UI only where still deferred (e.g. `/shop`)

### What This Does NOT Cover (Deferred / superseded — read with Batch 2C)
- **Full Notion coverage** — journal integrated; timeline remains static (no Notion timeline); voices use Notion for **registry** only, not full source feature parity
- **RSS/newswire** — **delivered in Batch 2C**; lines below in Batch 2B are stale where marked done in 2C
- **Discord invite widget** — community integration
- **Analytics integration** — Vercel Analytics
- **Share functionality** — share buttons and modal
- **Media components** — inline player modal, audio/video players
- **Advanced content** — book-club, music, curated, posts sections
- **Dynamic routing** — journal `[slug]` **is implemented**; other dynamic routes remain future work
- **Skeleton variants** — specialized loading UI per content type
- **SEO enhancements** — Open Graph, Twitter cards, sitemap

---

## Batch 2C — Intel Foundation (Completed)

**Scope**: Minimum real product foundation for Voices archive, Newswire surface, and Home aggregated feed.

### Deliverables

#### Voices
- [x] `lib/notion/voices.repo.js` — Notion voices DB client
- [x] `lib/voices.js` — Voices feed service with RSS aggregation and deduping
- [x] `components/voices/VoiceCard.jsx` — Card UI for voice items
- [x] `components/voices/VoicesFeedSection.jsx` — Server section component
- [x] `app/(site)/voices/page.jsx` — Real listing page with IntelTabs

#### Newswire
- [x] `lib/data/newswire-sources.js` — Source manifest
- [x] `lib/feeds/rss.js` — RSS parser + fetch with caching
- [x] `lib/notion/curatedArticles.repo.js` — Curated articles from Notion
- [x] `lib/newswire.js` — Newswire aggregation with deduping
- [x] `components/newswire/NewswireHeadlineCard.jsx` — Card UI for headlines
- [x] `components/newswire/NewswireHeadlinesSection.jsx` — Client section with source filter
- [x] `components/newswire/NewswireSourceCard.jsx` — Source directory card
- [x] `app/intel/newswire/page.jsx` — Full newswire page with source directory and editorial sections
- [x] `components/IntelTabs.jsx` — Shared navigation between Voices and Newswire

#### Home Aggregated Feed
- [x] `components/home/JournalSection.jsx` — Latest journal entries
- [x] `components/home/NewswireSection.jsx` — Snapshot of newswire
- [x] `app/page.jsx` — Replaced placeholder with real sections

#### Shared
- [x] `lib/metadata.js` — Metadata helper for SEO titles/descriptions

### What This Covers
- Live `/voices` page showing aggregated feed items
- Live `/intel/newswire` page with headlines, source directory, and rationale
- Home page now displays up-to-date sections: Journal, Voices, Newswire
- Content updates automatically via Notion + RSS integration
- All pages maintain the rebuild’s military/HUD/document aesthetic

### What Remains Deferred After Batch 2C
- **Advanced filter/player behavior** — full tabbed voices archive, pagination, inline players, share actions
- **RSS overengineering** — no per-source error dashboards, no advanced image enrichment beyond RSS-provided
- **Commerce** — shop, cart, checkout, orders, Printify integration
- **Analytics** — Vercel Analytics, tracking
- **Discord** — invite widget
- **Terminal** — easter egg
- **Music, curated, book-club** — full sections (protest music feature in home is currently omitted per Batch 2C scope)
- **Voice detail pages** — individual voice profiles
- **Advanced SEO** — Open Graph, Twitter cards, sitemaps
- **Skeleton loading states** — replacing generic "Loading…" text with skeleton screens

### Dependencies
- Requires Batch 1 foundation (complete)

### Success Criteria
- Routes in scope build and render without errors
- `npm run build` succeeds
- `npm run lint` passes
- Pages have consistent layout and styling
- Loading states display appropriately
- Empty states show where content would appear
- Metadata exports are present and valid
- Placeholder messaging is clear and honest

---

## Batch 2B — Content Data Integration (Historical / partially superseded)

**Scope**: Originally “full Notion + RSS.” **Voices RSS, newswire aggregation, and newswire components shipped in Batch 2C** under different file paths (`lib/voices.js`, `lib/newswire.js`, `lib/feeds/rss.js`, `components/newswire/*`). Use **Current rebuild truth** as authority.

### Deliverables

#### Notion CMS Integration
- [x] Notion client + journal repo + blocks — `lib/notion/*`, `lib/journal.js`, `lib/notion-blocks.js`
- [x] Journal-specific data fetching — `lib/journal.js` + `lib/notion/journal.repo.js`
- [x] Voices registry + feed aggregation — **`lib/notion/voices.repo.js`**, **`lib/voices.js`** (not the legacy name `lib/data/voices.js`)
- [ ] `lib/data/timeline.js` — **deferred**; timeline stays static

#### Content Components
- [x] `components/content/NotionBlocksBody.jsx` — Notion block renderer (subset of block types)
- [ ] `components/content/MetaBlock.jsx` — Metadata display
- [ ] `components/content/JournalEntryBody.jsx` — Journal entry renderer
- [x] Timeline UI — **`components/sections/TimelineSection.jsx`** (static / source-grounded); optional Notion-driven timeline TBD
- [x] `components/newswire/` — **Shipped (2C)**

#### RSS / Feed System
- [x] RSS fetch + parse — **`lib/feeds/rss.js`** (replaces planned `lib/data/feeds.js` name)
- [x] Newswire headline cards and sections — **`components/newswire/*`**

#### Infrastructure
- [ ] Vercel Analytics integration
- [ ] Share buttons and modal
- [ ] Discord invite widget
- [ ] Skeleton variants per content type
- [ ] Advanced SEO (Open Graph, Twitter cards)
- [x] `app/(site)/journal/[slug]/page.jsx` — Individual journal entry pages

### Dependencies
- Requires Batch 2A route shells
- Requires Notion API credentials
- Requires RSS feed URLs

### Success Criteria (remaining for later batches)
- Journal entries display with proper Notion formatting (**met**)
- Voices feed shows cards (**met**); source-parity archive/player (**not met**)
- Timeline renders events (**met** as static summary)
- RSS aggregates on newswire + home (**met**)
- Share, Discord, analytics — **deferred**

---

## Batch 3 — Commerce & Advanced

**Scope**: Shop, cart, checkout, payments, advanced features

**Goal**: Full e-commerce flow and remaining site sections.

### Deliverables

#### Shop System
- [ ] `lib/data/printify.js` — Printify product catalog
- [ ] `lib/data/shop.js` — Shop data layer
- [x] `app/(site)/shop/page.jsx` — **Placeholder “Supply” page today** (replace with real listing in this batch)
- [ ] `app/(site)/shop/[productId]/page.jsx` — Product detail
- [ ] `components/shop/` — Product cards, filters, detail views

#### Cart & Checkout
- [ ] `providers/CartProvider.jsx` — Cart state management
- [ ] `app/(site)/shop/cart/page.jsx` — Shopping cart
- [ ] `app/(site)/shop/checkout/page.jsx` — Checkout flow
- [ ] `lib/stripe.js` — Stripe integration
- [ ] `app/api/checkout/route.js` — Checkout session creation

#### Order Management
- [ ] `lib/db/` — Supabase database layer
- [ ] `app/(site)/orders/page.jsx` — Order status lookup
- [ ] `app/api/webhooks/stripe/route.js` — Stripe webhook handler

#### Advanced Sections
- [ ] `app/(site)/music/page.jsx` — Protest music with YouTube players
- [ ] `app/(site)/book-club/page.jsx` — Book club with "currently reading"
- [ ] `app/(site)/terminal/page.jsx` — Terminal easter egg
- [ ] `app/(site)/posts/page.jsx` — Blog posts (or merge with journal)

#### Infrastructure
- [ ] `app/api/cron/` — Scheduled tasks
- [ ] Smoke test script for public routes
- [ ] Performance optimization (image optimization, caching)
- [ ] Error boundaries and error pages

### Dependencies
- Requires Batch 1 foundation
- Requires Batch 2 content system
- Requires Stripe API credentials
- Requires Printify API credentials
- Requires Supabase database setup

### Success Criteria
- Shop displays products from Printify
- Cart persists across sessions
- Checkout creates Stripe session and redirects
- Webhooks create order records in Supabase
- Order status lookup works
- Music section plays YouTube videos
- Book club shows recommendations
- Terminal easter egg is functional
- All public routes pass smoke test

---

## Batch Size Rules

1. **All batches are small and reviewable** — each batch should be completable in a single session
2. **Batch 1 is narrow** — only the minimum foundation, no full route scaffold
3. **Each batch builds on the previous** — no batch is standalone
4. **No batch includes everything** — deliberate scoping prevents drift
5. **Review gates between batches** — each batch must build, lint, and function before proceeding

---

*Created: 2026-04-06 · Last truth-sync: 2026-04-07*

*Status: Content surfaces (journal, voices RSS, newswire, home sections, timeline, legal) are **live**; shop and source-only intel features **deferred**. The `.next/` directory is gitignored — do not commit build output.*
