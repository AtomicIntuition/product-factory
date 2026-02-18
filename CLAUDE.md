# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is
An automated system that researches trending digital products on Etsy, identifies market gaps, generates high-quality spreadsheet templates (.xlsx), creates optimized listing copy and images, and publishes them to Etsy via the Open API v3. Fully automated end-to-end: research → analyze → generate → QA → publish.

## Tech Stack
- **Framework:** Next.js 14+ (App Router) — frontend/dashboard on Vercel
- **Backend:** Express.js — pipeline worker on Railway (Docker)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL) for product tracking, sales analytics, pipeline state
- **AI:** Anthropic Claude API (Opus 4.6 for all phases: research, analysis, generation, QA)
- **Images:** OpenAI gpt-image-1 for listing images (1024x1024, upscaled to 2000x2000 via sharp)
- **Spreadsheets:** ExcelJS for .xlsx generation (formulas, formatting, sheet protection)
- **Image Processing:** sharp for upscaling generated images to Etsy's 2000px+ requirement
- **Marketplace:** Etsy Open API v3 (PKCE OAuth 2.0, fully automated publishing)
- **Validation:** Zod for runtime validation of API responses and external data
- **Bundler:** esbuild bundles shared src/lib/ code for the backend

## Deployment
- **Frontend:** Vercel — https://product-factory-rtgm.vercel.app/dashboard
- **Backend:** Railway — https://factory-backend-production.up.railway.app
- **Repo:** https://github.com/AtomicIntuition/product-factory.git

## Architecture

```
Browser → Vercel (Next.js)                    Railway (Express)
           │                                     │
           ├─ Dashboard pages                    │
           ├─ CRUD API routes (Supabase)         │
           ├─ POST /api/pipeline ──proxy──→ POST /api/pipeline
           │   (with x-backend-secret)           ├─ executeResearch()
           │                                     ├─ executeGeneration() → executePostGeneration()
           │                                     └─ publishToEtsy()
           │                                     │
           └─── polls GET /api/pipeline ←── both read/write ──→ Supabase
```

**Key design:** On Railway, `generate` runs `executeGeneration()` then `executePostGeneration()` sequentially in-process. `publish` calls `publishToEtsy()` asynchronously. No self-referencing fetch. No `after()`. No timeout limits.

### Pipeline Phases
1. **RESEARCH** — Etsy API search (10 query variations) + Claude Opus deep analysis (~2 min)
2. **ANALYZE** — Claude Opus identifies gaps, scores spreadsheet template opportunities (auto-runs after research)
3. **GENERATE** — Claude Opus multi-call architecture (~2-3 min):
   - Phase 1: Blueprint call (metadata, title, description, 13 tags, taxonomy_id, thumbnail prompt, 4 preview prompts, 3-7 sheet plans, color scheme)
   - Phase 2: Parallel Opus calls, one per sheet (complete SheetSpec with columns, rows, formulas, styles)
   - Phase 3: Assembly into SpreadsheetSpec JSON
4. **POST-GENERATE** — QA evaluation (Opus) → lesson extraction → 5 listing images (gpt-image-1 + sharp upscale) → spreadsheet build (ExcelJS .xlsx) — auto-runs after generate
5. **PUBLISH** — Fully automated via Etsy API: create draft listing → upload 5 images → upload .xlsx file → activate listing

Each phase logs to `pipeline_runs` in Supabase. The dashboard auto-polls and shows live progress.

## Project Structure
```
backend/
├── src/
│   ├── server.ts              # Express entry point (port from env)
│   ├── routes/pipeline.ts     # Pipeline route handler (research, generate, publish)
│   └── middleware/auth.ts     # x-backend-secret validation
├── esbuild.config.js          # Bundles shared code + backend into dist/server.js
├── Dockerfile                 # Docker build for Railway
├── package.json               # Express deps + esbuild
└── tsconfig.json              # Typecheck only (noEmit), bundler resolution

src/
├── app/
│   ├── dashboard/             # Main control panel UI
│   │   ├── page.tsx           # Overview with stats and pipeline activity
│   │   ├── research/          # Etsy market research & opportunities
│   │   ├── products/          # Product management & detail views
│   │   ├── lessons/           # QA lessons learned
│   │   ├── analytics/         # Sales tracking with Etsy fee calculations
│   │   └── settings/          # Etsy OAuth connection management
│   └── api/
│       ├── pipeline/route.ts  # Proxies POST to Railway, GET/DELETE reads Supabase
│       ├── products/          # Product CRUD
│       ├── research/          # Research reports
│       ├── analytics/         # Sales tracking
│       ├── lessons/           # Lesson CRUD
│       └── etsy/auth/         # OAuth start, callback, status endpoints
├── components/
│   └── sidebar.tsx            # Navigation sidebar
├── lib/
│   ├── ai/                    # Claude API integration
│   │   ├── client.ts          # promptClaude() + streamClaude() wrapper
│   │   ├── researcher.ts      # Etsy market research (API + Claude analysis)
│   │   ├── analyzer.ts        # Gap analysis for spreadsheet templates
│   │   ├── generator.ts       # Spreadsheet blueprint + per-sheet generation
│   │   ├── evaluator.ts       # QA evaluation (5 spreadsheet dimensions)
│   │   ├── lesson-extractor.ts # Extract lessons from QA feedback
│   │   ├── images.ts          # gpt-image-1 multi-image generation + sharp upscale
│   │   └── copywriter.ts      # Etsy listing copy optimization
│   ├── etsy/
│   │   ├── client.ts          # Etsy API v3 client (search, CRUD, upload)
│   │   ├── oauth.ts           # PKCE OAuth 2.0 flow
│   │   └── publisher.ts       # Automated Etsy publishing (4-step)
│   ├── spreadsheet/
│   │   └── builder.ts         # ExcelJS .xlsx builder (spec JSON → workbook)
│   ├── supabase/              # Database client and queries
│   └── pipeline/orchestrator.ts # All execute*() functions
├── types/index.ts             # TypeScript type definitions
└── config/env.ts              # Zod-validated env vars
```

## Commands
- `npm run dev` — Start Next.js dev server (port 3000)
- `npm run dev:backend` — Start Express backend (port 3001)
- `npm run dev:all` — Start both concurrently
- `npm run build` — Production build (Next.js)
- `npm run typecheck` — TypeScript check (frontend)
- `npm run typecheck:backend` — TypeScript check (backend)
- Backend rebuild: `cd backend && npm run build` (esbuild bundle)
- Deploy backend: `npx @railway/cli up` (from repo root)
- Deploy frontend: `npx vercel --prod`

## Environment Variables

**Vercel** (frontend):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `BACKEND_URL` — Railway backend URL
- `BACKEND_SECRET` — shared auth secret
- `ETSY_API_KEY`, `ETSY_SHARED_SECRET`, `ETSY_SHOP_ID`

**Railway** (backend):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ETSY_API_KEY`, `ETSY_SHARED_SECRET`, `ETSY_SHOP_ID`
- `ETSY_ACCESS_TOKEN`, `ETSY_REFRESH_TOKEN` (optional — populated via OAuth flow)
- `BACKEND_SECRET`, `FRONTEND_URL`

**Local dev:**
- `.env.local` — add `BACKEND_URL=http://localhost:3001` + `BACKEND_SECRET=dev-secret`
- `backend/.env` — all pipeline vars + `BACKEND_SECRET=dev-secret`

## Critical Technical Constraints

1. **ExcelJS data validation (dropdowns) do NOT work in Google Sheets** — Never use `dataValidation` in ExcelJS. Use text labels/headers and conditional formatting instead.
2. **ExcelJS data validation + conditional formatting on same sheet can corrupt workbooks** — Use them on separate sheets if both are ever needed.
3. **Etsy requires 2000px+ images** — gpt-image-1 generates 1024x1024. All images are upscaled to 2000x2000 with sharp (lanczos3).
4. **Etsy allows up to 20 listing images** — We generate 5 per product (cover, laptop mockup, feature callouts, sheet overview, compatibility).
5. **Etsy AI disclosure required** — Must label products as "Designed by" and disclose AI usage in description.
6. **Google Sheets compatibility** — No macros, no VBA, no pivot tables, no data validation dropdowns. Standard formulas only: SUM, AVERAGE, IF, SUMIF, VLOOKUP, COUNTIF, MAX, MIN, TODAY, TEXT.
7. **Etsy allows 13 tags** — All 13 must be used. Long-tail, no plurals, no title repeats.

## Code Standards
- ES modules (import/export) only, never CommonJS
- All functions must have TypeScript return types
- Zod for runtime validation of all API responses and external data
- Environment variables in `.env.local`, validated at startup with Zod
- Keep components under 200 lines; split if larger

## Rules
- ALWAYS run `npm run typecheck` after making code changes
- ALWAYS run `cd backend && npm run build` after changing shared src/lib/ code
- ALWAYS add Zod input validation when creating new API routes
- ALWAYS validate Claude API output structure before proceeding in the pipeline
- ALWAYS check `stop_reason` on Claude API responses to detect truncation
- Generation uses multi-call Opus architecture (1 blueprint + N sheet calls + 1 QA). Each call uses maxTokens: 4096.
- Product spreadsheets have 3-7 sheets. First sheet MUST be "Instructions".
- Research intelligence (Etsy listing data + top seller patterns) flows through report summary into generator blueprint.
- Max 5 lessons injected into generator prompt to avoid token bloat.
- Images: 5 per product, gpt-image-1 1024x1024 → sharp upscale to 2000x2000.
- Spreadsheet built during post-generation via ExcelJS (preview before publish).
- Publishing is fully automated via Etsy Open API v3 (create draft → upload images → upload file → activate).

## QA Dimensions
- `structure_quality` — sheet organization, column layout, logical data flow
- `formula_correctness` — formulas are valid, no circular refs, correct references
- `visual_design` — professional formatting, consistent colors, readability
- `usability` — intuitive for non-technical users, clear labels, instructions sheet
- `listing_copy` — Etsy SEO title, 13 effective tags, value-selling description
