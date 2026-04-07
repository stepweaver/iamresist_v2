# Build Plan — I AM [RESIST]

## Batch Structure

Three batches, each small and reviewable. Batch 1 is narrow and foundational. Batches 2 and 3 build on the foundation.

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
- [ ] `public/` — Favicon, icons (deferred until source assets are identified)

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

## Batch 2 — Content Routes

**Scope**: All content pages, Notion integration, feed system, SEO

**Goal**: Populate the site with real content — journal, voices, timeline, about, legal, curated resources.

### Deliverables

#### Notion CMS Integration
- [ ] `lib/data/notion.js` — Notion client, page fetching, block rendering
- [ ] `lib/data/journal.js` — Journal-specific data fetching
- [ ] `lib/data/voices.js` — Voices/intel data fetching
- [ ] `lib/data/timeline.js` — Timeline data fetching

#### Content Pages
- [ ] `app/(site)/about/page.jsx` — Mission/About page
- [ ] `app/(site)/journal/page.jsx` — Journal listing
- [ ] `app/(site)/journal/[slug]/page.jsx` — Individual journal entry
- [ ] `app/(site)/voices/page.jsx` — Voices/intel feed
- [ ] `app/(site)/timeline/page.jsx` — Timeline page
- [ ] `app/(site)/legal/page.jsx` — Legal/disclaimer page
- [ ] `app/(site)/curated/page.jsx` — Curated resources

#### Content Components
- [ ] `components/content/NotionBlocksBody.jsx` — Notion block renderer
- [ ] `components/content/MetaBlock.jsx` — Metadata display
- [ ] `components/content/JournalEntryBody.jsx` — Journal entry renderer
- [ ] `components/content/Timeline.jsx` — Timeline component
- [ ] `components/newswire/` — Newswire feed components

#### RSS / Feed System
- [ ] `lib/data/feeds.js` — RSS feed fetching and parsing
- [ ] Newswire headline cards and sections

#### SEO / Metadata
- [ ] `lib/config/metadata.js` — Dynamic metadata generation
- [ ] Per-page metadata for all content routes
- [ ] Open Graph and Twitter card support

#### Infrastructure
- [ ] Vercel Analytics integration
- [ ] Skeleton loading states for all content sections
- [ ] Share buttons and modal
- [ ] Discord invite widget

### Dependencies
- Requires Batch 1 foundation
- Requires Notion API credentials
- Requires RSS feed URLs

### Success Criteria
- All content pages render with real data from Notion
- Journal entries display with proper formatting
- Voices feed shows cards with audio player
- Timeline renders interactive events
- RSS feeds display in newswire section
- SEO metadata is correct for every page
- Loading skeletons show during data fetch

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
*Status: Phase 1 — Planning*
