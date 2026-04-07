# Build Plan — I AM [RESIST]

## Batch Structure

Three batches, each small and reviewable. Batch 1 is narrow and foundational. Batches 2 and 3 build on the foundation.

---

## Current rebuild truth (synced 2026-04-07)

Use this table as **product/doc truth** for what exists today vs what is still deferred.

| Capability | State |
|------------|--------|
| Journal (Notion list + `[slug]` + block body) | **Live** |
| Timeline | **Live** — static, Brennan Center–attributed summary + timeline UI |
| Voices / Intel | **Placeholder** page only |
| Home hero / mission | **Live** |
| Home aggregated feed (journal + intel + newswire) | **Not built** — explicit placeholder copy on home |
| Shop / commerce | **`/shop` placeholder page only** — no catalog, cart, checkout, APIs |
| Newswire / RSS | **Not in rebuild** |
| `/resources` | **Missing** |
| Shared content primitives (`PageContainer`, `EmptyState`, etc.) | **Present** (used by routes) |

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

### What This Does NOT Cover
- No CMS integration (Notion)
- No data fetching (feeds, journal, voices)
- No shop/cart/checkout
- No journal, timeline, legal, music, book-club, terminal pages
- No API routes
- No webhooks or cron jobs
- No analytics integration

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

**Reality check**: The rebuild has **surpassed** pure “shells” for journal and timeline; voices and home feed remain placeholders. Checkboxes below reflect **actual files**.

### Deliverables

#### Route Structure
- [ ] `app/(site)/layout.jsx` — Shared layout for content pages (optional; rebuild still uses root layout only)
- [x] `app/(site)/about/page.jsx` — Mission/About page
- [x] `app/(site)/voices/page.jsx` — Voices/intel **placeholder** UI (no data layer)
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
- All five routes are accessible and render
- Consistent page layout and design language
- Loading states for async content
- Empty states for no-data scenarios
- Proper metadata for SEO
- Placeholder UI that clearly indicates content integration pending

### What This Does NOT Cover (Deferred to Batch 2B)
- **Full Notion coverage** — journal is integrated; **voices/timeline Notion data layers** are not
- **RSS/newswire plumbing** — no feed aggregation
- **Discord invite widget** — community integration
- **Analytics integration** — Vercel Analytics
- **Share functionality** — share buttons and modal
- **Media components** — inline player modal, audio/video players
- **Advanced content** — book-club, music, curated, posts sections
- **Dynamic routing** — journal `[slug]` **is implemented**; other dynamic routes remain future work
- **Skeleton variants** — specialized loading UI per content type
- **SEO enhancements** — Open Graph, Twitter cards, sitemap

### Dependencies
- Requires Batch 1 foundation (complete)

### Success Criteria
- All 5 routes build and render without errors
- `npm run build` succeeds
- `npm run lint` passes
- Pages have consistent layout and styling
- Loading states display appropriately
- Empty states show where content would appear
- Metadata exports are present and valid
- Placeholder messaging is clear and honest

---

## Batch 2B — Content Data Integration (Deferred)

**Scope**: Full Notion integration, RSS feeds, and content components.

**Goal**: Populate the content pages with real data.

### Deliverables

#### Notion CMS Integration
- [x] Notion client + journal repo + blocks — implemented as `lib/notion/*`, `lib/journal.js`, `lib/notion-blocks.js` (paths differ from original `lib/data/notion.js` plan)
- [x] Journal-specific data fetching — `lib/journal.js` + `lib/notion/journal.repo.js`
- [ ] `lib/data/voices.js` — Voices/intel data fetching
- [ ] `lib/data/timeline.js` — Timeline data fetching

#### Content Components
- [x] `components/content/NotionBlocksBody.jsx` — Notion block renderer (subset of block types)
- [ ] `components/content/MetaBlock.jsx` — Metadata display
- [ ] `components/content/JournalEntryBody.jsx` — Journal entry renderer
- [ ] `components/content/Timeline.jsx` — Interactive timeline component
- [ ] `components/newswire/` — Newswire feed components

#### RSS / Feed System
- [ ] `lib/data/feeds.js` — RSS feed fetching and parsing
- [ ] Newswire headline cards and sections

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

### Success Criteria
- Journal entries display with proper Notion formatting
- Voices feed shows cards with metadata
- Timeline renders interactive events
- RSS feeds aggregate in newswire section
- All content pages have complete SEO metadata
- Share functionality works
- Analytics are tracking

---

## Batch 3 — Commerce & Advanced

**Scope**: Shop, cart, checkout, payments, advanced features

**Goal**: Full e-commerce flow and remaining site sections.

### Deliverables

#### Shop System
- [ ] `lib/data/printify.js` — Printify product catalog
- [ ] `lib/data/shop.js` — Shop data layer
- [ ] `app/(site)/shop/page.jsx` — Product listing
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

*Created: 2026-04-06*
*Status: Phase 2 — In progress; journal + partial Notion + timeline live; placeholders documented above.*
