# Rebuild Strategy — I AM [RESIST]

## Overview

This document defines the architectural, structural, and design strategy for rebuilding iamresist.org from the ground up. The source repo (`C:\Users\stephen\source\iamresist`) serves as **product truth**, not **structural truth**. Every decision is interpretive: preserve capability, meaning, and identity while improving architecture, code organization, and maintainability.

---

## 1. Target Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Rendering | React 19 (Server Components by default) |
| Styling | Tailwind CSS v4 |
| Language | JavaScript (JSX) — matching source |
| Database | Supabase (future batches) |
| CMS | Notion API — **journal live**; **voices directory live** (feed URLs + metadata in Notion); book club later |
| E-commerce | Stripe + Printify (future batches) |
| Hosting | Vercel |
| Analytics | Vercel Analytics |
| Testing | Vitest (future batches) |

### Directory Structure
```
iamresist-rebuild/
├── app/                    # Next.js App Router
│   ├── page.jsx            # Home `/` (kept at app root, not under `(site)`)
│   ├── intel/page.jsx      # 301 → /voices (URL preservation)
│   ├── intel/newswire/page.jsx  # Full newswire surface `/intel/newswire`
│   ├── (site)/             # Route group (URLs omit the group name)
│   │   ├── layout.jsx      # Optional shared layout (rebuild: not used)
│   │   ├── about/
│   │   ├── voices/
│   │   ├── journal/
│   │   ├── timeline/
│   │   ├── shop/
│   │   ├── legal/
│   │   └── ...
│   ├── api/                # API routes (server-only)
│   ├── layout.jsx          # Root layout (html, body, fonts, providers)
│   ├── globals.css         # Global styles, theme vars, design tokens
│   ├── not-found.jsx       # 404 page
│   └── loading.jsx         # Global loading state
├── components/             # UI components (render-bearing)
│   ├── layout/             # Navigation, Footer, DocumentChrome, ThemeProvider
│   ├── ui/                 # Atomic/shared UI (Badge, Divider, etc.)
│   ├── home/               # Home page specific components
│   └── ...
├── hooks/                  # Reusable stateful logic and interaction hooks
├── lib/                    # Server utilities, data access, config
│   ├── data/               # Data fetching functions (Notion, Supabase, feeds)
│   ├── config/             # Site config, constants
│   └── utils/              # Pure utility functions
├── public/                 # Static assets
├── docs/                   # Project documentation
└── ...
```

### Key Architectural Principles
- **Server Components by default** — only use `'use client'` where interactivity is strictly necessary (state, effects, event handlers, browser APIs)
- **Clean client/server boundary** — server components fetch data, pass to client components only for rendering interactivity
- **hooks/ = stateful logic** — custom hooks, interaction hooks, browser API wrappers
- **components/ = render-bearing UI** — everything that produces JSX output
- **lib/ = server utilities** — data fetching, config, pure utilities, API integrations

---

## 2. Route Strategy

### URL Preservation Policy
All existing public URLs are **preserved by default**. No URL changes without explicit documentation.

| Route | Status | Notes |
|-------|--------|-------|
| `/` | Preserved | Home page |
| `/about` | Preserved | Mission/About page |
| `/voices` | Preserved | Voices/Intel hub — RSS aggregated feed listing |
| `/intel` | **Redirect → `/voices`** | Implemented: `app/intel/page.jsx` (`permanentRedirect`) |
| `/intel/newswire` | Preserved | Newswire headlines + source directory (`app/intel/newswire/page.jsx`) |
| `/journal` | Preserved | Journal entries |
| `/journal/[slug]` | Preserved | Individual journal entries |
| `/timeline` | Preserved | Resistance timeline |
| `/shop` | Preserved | **Placeholder page** — no catalog (commerce batch) |
| `/shop/[product]` | Preserved | **Not in rebuild** — product routes deferred |
| `/shop/cart` | Preserved | **Not in rebuild** |
| `/shop/checkout` | Preserved | **Not in rebuild** |
| `/shop/orders` | Preserved | **Not in rebuild** (source used `/orders`; same deferral) |
| `/legal` | Preserved | Legal/disclaimer page |
| `/resources` | Preserved | **Not in rebuild** — route missing |
| `/curated` | Preserved | **Not in rebuild** |
| `/posts` | Preserved | **Not in rebuild** |
| `/music` | Preserved | **Not in rebuild** |
| `/terminal` | Preserved | **Not in rebuild** |
| `/book-club` | Preserved | **Not in rebuild** |
| `/api/*` | Preserved | **Not in rebuild** |

### Documented URL Changes
| Old URL | New URL | Reason | Redirect Required |
|---------|---------|--------|-------------------|
| `/intel` | `/voices` | Source has duplicate nav label "INTEL" pointing to `/voices`. Consolidate under `/voices` as primary, redirect `/intel` → `/voices` | 301 permanent |

---

## 3. Component Strategy

### Component Classification
| Type | Location | Purpose |
|------|----------|---------|
| Layout | `components/layout/` | Navigation, Footer, DocumentChrome, ThemeProvider |
| UI Atoms | `components/ui/` | Badge, Divider, Stamp, Button primitives |
| Home Page | `components/home/` | Hero, RotatingWord, HUD; field sections (journal, voices, newswire) |
| Content | `components/content/` | NotionBlocksBody, MetaBlock, JournalEntryBody |
| Shop | `components/shop/` | Cart, ProductCard, Checkout |
| Media | `components/media/` | NewswireImage, InlinePlayerModal, DiscordInvite |
| Navigation | `components/layout/Navigation.jsx` | Single component (source split into `components/nav/` atoms; rebuild inlines desktop + mobile) |

### Reimplementation Rules
- **No copy-forward** — reimplement from understanding, not from source code
- **Preserve visual identity** — military/HUD/document aesthetic must be maintained
- **Improve boundaries** — separate server data fetching from client interactivity
- **Smaller components** — break monolithic components into focused pieces
- **Consistent naming** — PascalCase for components, camelCase for hooks and utils

---

## 4. Hooks vs Components Rule

### hooks/ — Reusable Stateful Logic
Custom hooks that encapsulate:
- State management patterns (cart, theme, modals)
- Browser API interactions (focus traps, swipe detection)
- Subscription/interval logic (rotating word, feed polling)
- Form state and validation

**Rule**: If it uses `useState`, `useEffect`, `useRef`, or other React hooks AND is reusable across components, it belongs in `hooks/`.

### components/ — Render-Bearing UI
Components that:
- Produce JSX output
- Accept props and render UI
- May use hooks internally for their own rendering logic
- May be server components (default) or client components (when interactive)

**Rule**: If its primary purpose is to render UI, it belongs in `components/`.

### Providers
- Theme provider → `components/layout/ThemeProvider.jsx` (wraps app, manages theme state)
- Cart provider → `context/CartContext.jsx` or `providers/CartProvider.jsx` (state management)
- Providers may live in `components/layout/` or a dedicated `providers/` directory — **consistency is the rule**

---

## 5. Data/Content Strategy

### Content Sources
| Source | Purpose | Integration |
|--------|---------|-------------|
| Notion API | Journal entries, voices/intel feed, book club | Server components, cached revalidation |
| Supabase | Shop orders, user data, cart persistence | Server actions + client hydration |
| Stripe | Payment processing | Server-side API routes + webhooks |
| Printify | Product catalog, fulfillment | Server-side API integration |
| RSS Feeds | External news/newswire | Server-side fetching, cached |
| YouTube | Protest music videos | Server-side metadata, client player |
| Discord | Community invite widget | Client component |

### Data Fetching Strategy
- **Server components** fetch data directly using `async/await`
- **Revalidation** via `export const revalidate = N` for cached content
- **Suspense boundaries** for loading states
- **Server actions** for mutations (cart, orders, form submissions)
- **No client-side data fetching** unless real-time interaction requires it

---

## 6. Server/Client Boundary Strategy

### Server Components (Default)
- Page components
- Layout components
- Data fetching components
- Static content rendering
- SEO/metadata generation

### Client Components (Explicit)
- Navigation (mobile menu toggle, theme toggle, cart badge)
- ThemeProvider (theme state, cookie management)
- CartProvider (cart state management)
- RotatingWord (animation, interval timers)
- Modal components (focus trap, keyboard handling)
- Media players (audio/video controls)
- Form components (input state, validation)
- Interactive filters and tabs

### Boundary Pattern
```
Server Page → Server Data Fetch → Client Component (interactive)
                                    ↓
                              Server Action (mutation)
```

---

## 7. Design System Strategy

### Visual Identity
- **Aesthetic**: Military/HUD/document briefing packet
- **Color palette**: Antifa black & red — dark backgrounds, red accents, steel greys
- **Typography**: Orbitron (display/headings), Rajdhani (UI labels), IBM Plex Sans (body), Share Tech Mono (code/readouts)
- **Visual effects**: HUD grid overlays, scanline animations, target brackets, machine panel borders
- **Document chrome**: Metadata banners, DOC IDs, timestamps, classification markings

### Theme System
- **Dark mode** (default): Deep blacks, red accents, HUD overlays
- **Light mode**: Muted paper tones, same red accents, softer HUD effects
- **Theme persistence**: Cookie-based, respected on server render
- **Reduced motion**: Respect `prefers-reduced-motion` for animations

### Spacing & Hierarchy
- **Disciplined spacing**: Use Tailwind's spacing scale consistently
- **Max width**: `max-w-[1600px]` for content containers
- **Responsive**: Mobile-first, breakpoints at sm/md/lg/xl
- **Typography scale**: Clear hierarchy from display headings to body copy

---

## 8. Security Strategy

### Data Protection
- **No secrets in client code** — all API keys and tokens server-side only
- **Environment variables** — validated at startup, typed access
- **CSP headers** — restrict script/style sources
- **Image protection** — CSS-based prevention of drag/save (defense in depth)

### Input Handling
- **Sanitize all user input** — especially Notion-rendered content
- **Server-side validation** — all form inputs validated before processing
- **Stripe webhooks** — signature verification required

### Session/Cookie Security
- **Theme cookie** — non-sensitive, safe for client access
- **Cart state** — localStorage + server sync, no sensitive data
- **Session cookies** — httpOnly, secure, sameSite for any auth

---

## 9. Testing Strategy

### Test Layers
| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Utility functions, hooks, pure logic |
| Component | Vitest + React Testing Library | Interactive components |
| Integration | Vitest | Server actions, data fetching |
| E2E | Playwright (future) | Critical user flows |
| Smoke | Custom script | Public route availability |

### Testing Principles
- Test behavior, not implementation
- Server components tested via integration tests
- Client components tested with user interaction patterns
- Mock external APIs (Notion, Stripe, Supabase)
- Smoke test all public routes after deployment

---

## 10. Build Batches

### Batch 1 — Foundation (**done**)
- Project scaffold, package.json, Next.js 15, Tailwind v4
- Root layout, globals.css, theme system
- Home composition shell + field channels
- Navigation, Footer, DocumentChrome components
- Visual identity foundation

### Batch 2 — Content routes (**in progress** — journal, voices, newswire, timeline, legal live; see `02-build-plan.md`)
- About/Mission page
- Journal system with Notion integration
- Voices/Intel RSS feed + newswire surface
- Timeline page (static / source-grounded)
- Legal page
- Loading states, not-found handling per section

### Batch 3 — Commerce & Advanced (**deferred**)
- Shop product listing and detail
- Cart and checkout flow
- Stripe integration
- Printify integration
- Webhooks and cron jobs
- Orders management
- Book club, music, terminal, curated sections
- Analytics and monitoring

---

*Created: 2026-04-06 · Last truth-sync: 2026-04-07*

### As-built snapshot
See **`02-build-plan.md` → “Current rebuild truth”** for the checklist. Summary:

| | |
|--|--|
| **Done** | Journal (Notion), voices RSS feed (`/voices`), newswire (`/intel/newswire`), home field sections, static timeline, legal, about, `/intel` → `/voices`, theme + chrome |
| **Partial** | Intel vs source (no books/resources tabs, no inline audio player, no homepage shop/book-club/music cards); Batch-2B doc is partly superseded by 2C |
| **Deferred** | Commerce (`/shop` placeholder only), `/resources`, curated/posts/music/terminal/Discord/share/analytics APIs |
