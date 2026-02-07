# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is
An automated system that researches trending digital products on Gumroad, identifies market gaps, generates high-quality digital products (prompt packs), creates optimized listing copy, thumbnails, and PDFs, and deploys them to Gumroad via API.

## Tech Stack
- **Framework:** Next.js 14+ (App Router) — frontend/dashboard on Vercel
- **Backend:** Express.js — pipeline worker on Railway (Docker)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL) for product tracking, sales analytics, pipeline state
- **AI:** Anthropic Claude API (Opus 4.6 for research/analysis, Sonnet 4.5 for generation)
- **Images:** OpenAI gpt-image-1 for thumbnails (square 1:1, b64_json)
- **PDF:** jsPDF for product PDF generation
- **Marketplace:** Gumroad API for publishing and sales tracking
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
           │                                     └─ executePublish()
           │                                     │
           └─── polls GET /api/pipeline ←── both read/write ──→ Supabase
```

**Key design:** On Railway, `generate` runs `executeGeneration()` then `executePostGeneration()` sequentially in-process. No self-referencing fetch. No `after()`. No timeout limits.

### Pipeline Phases
1. **RESEARCH** — Claude Opus analyzes Gumroad market data (~2 min)
2. **ANALYZE** — Claude Opus identifies gaps and scores opportunities (auto-runs after research)
3. **GENERATE** — Claude Sonnet creates product content via streaming (~2-3 min)
4. **POST-GENERATE** — QA evaluation (Opus) → lesson extraction → thumbnail (gpt-image-1) → PDF generation (auto-runs after generate)
5. **PUBLISH** — Generate PDF, upload to Gumroad via API, set pricing, activate

Each phase logs to `pipeline_runs` in Supabase. The dashboard auto-polls and shows live progress.

## Project Structure
```
backend/
├── src/
│   ├── server.ts              # Express entry point (port from env)
│   ├── routes/pipeline.ts     # Pipeline route handler
│   └── middleware/auth.ts     # x-backend-secret validation
├── esbuild.config.js          # Bundles shared code + backend into dist/server.js
├── Dockerfile                 # Docker build for Railway
├── package.json               # Express deps + esbuild
└── tsconfig.json              # Typecheck only (noEmit), bundler resolution

src/
├── app/
│   ├── dashboard/             # Main control panel UI
│   └── api/
│       ├── pipeline/route.ts  # Proxies POST to Railway, GET/DELETE reads Supabase
│       ├── products/          # Product CRUD
│       ├── research/          # Research reports
│       └── analytics/         # Sales tracking
├── lib/
│   ├── ai/                    # Claude API integration
│   │   ├── client.ts          # promptClaude() + streamClaude() wrapper
│   │   ├── researcher.ts      # Market research
│   │   ├── analyzer.ts        # Gap analysis
│   │   ├── generator.ts       # Product content generation
│   │   ├── evaluator.ts       # QA evaluation
│   │   ├── lesson-extractor.ts # Extract lessons from QA
│   │   └── thumbnail.ts       # gpt-image-1 thumbnail generation
│   ├── gumroad/client.ts      # Gumroad API with retry + backoff
│   ├── pdf/generator.ts       # jsPDF product PDF
│   ├── supabase/              # Database client and queries
│   └── pipeline/orchestrator.ts # All execute*() functions
├── types/index.ts             # TypeScript type definitions
└── config/env.ts              # Zod-validated env vars

railway.toml                   # Railway config (Dockerfile path, health check)
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
- All existing Supabase/Gumroad vars
- `BACKEND_URL` — Railway backend URL
- `BACKEND_SECRET` — shared auth secret

**Railway** (backend):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GUMROAD_API_TOKEN`, `GUMROAD_SELLER_ID`
- `BACKEND_SECRET`, `FRONTEND_URL`

**Local dev:**
- `.env.local` — add `BACKEND_URL=http://localhost:3001` + `BACKEND_SECRET=dev-secret`
- `backend/.env` — all pipeline vars + `BACKEND_SECRET=dev-secret`

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
- ALWAYS handle Gumroad API rate limits with exponential backoff
- ALWAYS validate Claude API output structure before proceeding in the pipeline
- ALWAYS check `stop_reason` on Claude API responses to detect truncation
- ALWAYS use streaming (`onProgress` callback) for generation to track progress
- Generation maxTokens is 12288 (output budget ~8000 tokens, 25-30 prompts)
- Max 5 lessons injected into generator prompt to avoid token bloat
- Thumbnails: gpt-image-1, 1024x1024, square format, b64_json
- PDF generated during post-generation (preview before publish)
