# Feature Map — I AM [RESIST]

## Source Feature Inventory

Every meaningful feature from the source repo, mapped to its rebuild destination.

---

## Core Site Features

### 1. Home Page
- **What it does**: Hero section with rotating word, mission statement, HUD overlay, and live content feed (voices, journal, newswire)
- **Source**: `app/page.jsx`, `components/HomeFeed.server.jsx`, `components/HudOverlay.jsx`, `components/RotatingWord.jsx`
- **Rebuild decision**: **Adapted** — restructure with cleaner server/client boundaries
- **Destination**: `app/(site)/page.jsx`, `components/home/`
- **URL change**: No — `/` preserved

### 2. Navigation
- **What it does**: Fixed top nav with desktop links, mobile hamburger menu, theme toggle, cart badge with bounce animation
- **Source**: `app/components/Navigation.jsx`, `NavDesktopLinks.jsx`, `NavMobileMenu.jsx`, `NavThemeToggle.jsx`
- **Rebuild decision**: **Adapted** — cleaner structure, same behavior
- **Destination**: `components/layout/Navigation.jsx`, `components/nav/`
- **URL change**: No

### 3. Footer
- **What it does**: Footer links, copyright, support email, legal disclaimer
- **Source**: `app/components/Footer.jsx`
- **Rebuild decision**: **Kept** — straightforward, reimplement cleanly
- **Destination**: `components/layout/Footer.jsx`
- **URL change**: No

### 4. Document Chrome
- **What it does**: Briefing-packet aesthetic wrapper — paper texture, metadata banner with date, sticky sub-nav bar
- **Source**: `app/components/DocumentChrome.jsx`, `MetadataBannerDate.jsx`
- **Rebuild decision**: **Adapted** — same concept, cleaner implementation
- **Destination**: `components/layout/DocumentChrome.jsx`
- **URL change**: No

### 5. Theme System
- **What it does**: Dark/light theme with cookie persistence, CSS custom properties, Tailwind v4 theme integration
- **Source**: `app/components/ThemeProvider.jsx`, `app/globals.css`
- **Rebuild decision**: **Adapted** — same token system, cleaner provider
- **Destination**: `components/layout/ThemeProvider.jsx`, `app/globals.css`
- **URL change**: No

### 6. Typography / Font System
- **What it does**: Four-font system — Orbitron (display), Rajdhani (UI), IBM Plex Sans (body), Share Tech Mono (code/readouts)
- **Source**: `app/fonts.js`
- **Rebuild decision**: **Kept** — same fonts, same roles
- **Destination**: `app/fonts.js`
- **URL change**: No

---

## Content Features

### 7. About / Mission Page
- **What it does**: Full mission statement, resistance philosophy, site purpose
- **Source**: `app/about/page.jsx`
- **Rebuild decision**: **Adapted** — reimplement with same content, better structure
- **Destination**: `app/(site)/about/page.jsx`
- **URL change**: No

### 8. Journal System
- **What it does**: Blog-style journal entries sourced from Notion, with individual slug pages, body rendering (Notion blocks), metadata banners
- **Source**: `app/journal/page.jsx`, `app/journal/[slug]/page.jsx`, `lib/journal.js`, `components/JournalEntryBody.jsx`, `components/NotionBlocksBody.jsx`
- **Rebuild decision**: **Adapted** — Notion integration in Batch 2, shell in Batch 1
- **Destination**: `app/(site)/journal/page.jsx`, `app/(site)/journal/[slug]/page.jsx`, `lib/data/journal.js`
- **URL change**: No

### 9. Voices / Intel Feed
- **What it does**: Curated feed of voices/perspectives, sourced from Notion, with feed cards and player modal for audio
- **Source**: `app/voices/page.jsx`, `components/VoiceFeedCard.jsx`, `components/VoicesFeedSection.jsx`, `components/VoicesFeedWithPlayer.jsx`, `components/InlinePlayerModal.jsx`
- **Rebuild decision**: **Adapted** — Notion integration in Batch 2
- **Destination**: `app/(site)/voices/page.jsx`, `components/voices/`
- **URL change**: No — `/voices` is primary, `/intel` redirects here

### 10. Timeline
- **What it does**: Interactive timeline of resistance events, sourced from Notion or static data
- **Source**: `app/timeline/page.jsx`, `components/Timeline.jsx`, `lib/timeline.js`
- **Rebuild decision**: **Adapted** — data layer in Batch 2
- **Destination**: `app/(site)/timeline/page.jsx`, `components/timeline/`
- **URL change**: No

### 11. Legal Page
- **What it does**: Legal disclaimers, content attribution, terms
- **Source**: `app/legal/page.jsx`, `components/LegalSection.jsx`
- **Rebuild decision**: **Redesigned** — defer to Batch 2, don't copy source content verbatim
- **Destination**: `app/(site)/legal/page.jsx`
- **URL change**: No

---

## Commerce Features

### 12. Shop — Product Listing
- **What it does**: Grid of merchandise products from Printify, with filtering
- **Source**: `app/shop/page.jsx`, `lib/shopProducts.js`, `lib/shopPricing.js`, `components/shop/`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/shop/page.jsx`, `components/shop/`
- **URL change**: No

### 13. Shop — Product Detail
- **What it does**: Individual product page with size selection, pricing, add to cart
- **Source**: `app/shop/[productId]/page.jsx`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/shop/[productId]/page.jsx`
- **URL change**: No

### 14. Shopping Cart
- **What it does**: Client-side cart with localStorage persistence, quantity management, cart context provider
- **Source**: `app/context/CartContext.jsx`, `app/shop/cart/page.jsx`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `providers/CartProvider.jsx`, `app/(site)/shop/cart/page.jsx`
- **URL change**: No

### 15. Checkout Flow
- **What it does**: Stripe checkout session creation, redirect to Stripe hosted checkout
- **Source**: `app/shop/checkout/page.jsx`, `lib/stripe.js`, `app/api/checkout/route.js`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/shop/checkout/page.jsx`, `app/api/checkout/route.js`
- **URL change**: No

### 16. Order Management
- **What it does**: Order status lookup, Supabase-backed order records
- **Source**: `app/orders/page.jsx`, `lib/db/`, `lib/orderStatusToken.js`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/orders/page.jsx`
- **URL change**: No

### 17. Stripe Webhooks
- **What it does**: Handle Stripe webhook events for payment confirmation, order creation
- **Source**: `app/api/webhooks/stripe/route.js`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/api/webhooks/stripe/route.js`
- **URL change**: No

### 18. Printify Integration
- **What it does**: Product catalog sync, mock order creation for fulfillment
- **Source**: `lib/fulfillment/`, `scripts/list-printify-products.mjs`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `lib/data/printify.js`
- **URL change**: N/A (server-only)

---

## Content Aggregation Features

### 19. Newswire / RSS Feed
- **What it does**: Aggregated news headlines from RSS feeds, with source cards and media
- **Source**: `lib/feeds/`, `components/NewswireHeadlinesSection.jsx`, `components/NewswireHeadlineCard.jsx`, `components/NewswireSourceCard.jsx`
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: `lib/data/feeds.js`, `components/newswire/`
- **URL change**: No (integrated into home feed)

### 20. Protest Music
- **What it does**: Curated list of protest songs with embedded YouTube players
- **Source**: `app/music/page.jsx`, `lib/protestMusic.js`, `lib/videoContent.js`, `lib/youtube/`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/music/page.jsx`
- **URL change**: No

### 21. Book Club
- **What it does**: Book recommendations with cover images, descriptions, "currently reading" card
- **Source**: `app/book-club/page.jsx`, `lib/bookclub/`, `components/CurrentlyReadingCard.jsx`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/book-club/page.jsx`
- **URL change**: No

### 22. Terminal Easter Egg
- **What it does**: Interactive terminal-style interface
- **Source**: `app/terminal/page.jsx`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/(site)/terminal/page.jsx`
- **URL change**: No

### 23. Curated Resources
- **What it does**: Curated list of external resources and links
- **Source**: `app/curated/page.jsx`, `lib/curated.js`
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: `app/(site)/curated/page.jsx`
- **URL change**: No

### 24. Posts (Blog)
- **What it does**: Blog post listing and individual post pages
- **Source**: `app/posts/page.jsx`, `app/posts/[slug]/page.jsx`
- **Rebuild decision**: **Merged** — likely merged with journal system
- **Destination**: `app/(site)/journal/` or `app/(site)/posts/`
- **URL change**: TBD — evaluate if posts and journal should be unified

---

## Infrastructure Features

### 25. Notion CMS Integration
- **What it does**: Fetch pages, blocks, and properties from Notion database
- **Source**: `lib/notion/`, `lib/notion-blocks.js`
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: `lib/data/notion.js`
- **URL change**: N/A (server-only)

### 26. Supabase Database
- **What it does**: Order storage, user data, persistence layer
- **Source**: `lib/db/`, `supabase/`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `lib/db/`
- **URL change**: N/A (server-only)

### 27. Vercel Analytics
- **What it does**: Page view tracking and analytics
- **Source**: Root layout integration
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: Root layout
- **URL change**: No

### 28. Cron Jobs
- **What it does**: Scheduled tasks (feed refresh, cache warming)
- **Source**: `app/api/cron/`
- **Rebuild decision**: **Adapted** — Batch 3
- **Destination**: `app/api/cron/`
- **URL change**: No

### 29. SEO / Metadata
- **What it does**: Dynamic metadata generation, Open Graph, Twitter cards, sitemap
- **Source**: `lib/metadata.js`, `lib/siteConfig.js`
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: `lib/config/metadata.js`
- **URL change**: No

### 30. Image Protection
- **What it does**: CSS-based prevention of image selection, dragging, copying
- **Source**: `app/globals.css`
- **Rebuild decision**: **Kept** — same CSS rules, reimplemented
- **Destination**: `app/globals.css`
- **URL change**: No

### 31. Loading States
- **What it does**: Skeleton loaders for feeds, cards, documents
- **Source**: `app/loading.jsx`, `components/HomeFeedSkeleton.jsx`, `components/ContentSkeleton.jsx`, etc.
- **Rebuild decision**: **Adapted** — skeleton system in Batch 2
- **Destination**: `components/ui/skeletons/`
- **URL change**: No

### 32. 404 / Not Found
- **What it does**: Custom 404 page with resistance-themed messaging
- **Source**: `app/not-found.jsx`
- **Rebuild decision**: **Adapted** — reimplement with same aesthetic
- **Destination**: `app/not-found.jsx`
- **URL change**: No

### 33. Share Functionality
- **What it does**: Share buttons and modal for content sharing
- **Source**: `components/ShareButton.jsx`, `components/ShareModal.jsx`
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: `components/ui/ShareButton.jsx`
- **URL change**: No

### 34. Discord Invite Widget
- **What it does**: Embedded Discord community invite
- **Source**: `components/DiscordInvite.jsx`
- **Rebuild decision**: **Adapted** — Batch 2
- **Destination**: `components/community/DiscordInvite.jsx`
- **URL change**: No

---

## URL Change Summary

| Old URL | New URL | Reason | Redirect |
|---------|---------|--------|----------|
| `/intel` | `/voices` | Duplicate nav target — consolidate | 301 |

All other URLs preserved as-is.

---

*Created: 2026-04-06*
*Status: Phase 1 — Planning*
