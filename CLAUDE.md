# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is
An automated system that researches trending digital products on Gumroad, identifies market gaps, generates high-quality digital products (templates, prompt packs, guides, scripts, toolkits), creates optimized listing copy and thumbnails, and deploys them to Gumroad via API.

## Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL) for product tracking, sales analytics, pipeline state
- **AI:** Anthropic Claude API (Opus 4.6 for research/analysis, Sonnet 4.5 for generation tasks)
- **Marketplace:** Gumroad API for publishing and sales tracking
- **Queue/Cron:** Inngest or built-in Next.js cron for automated pipeline runs
- **Validation:** Zod for runtime validation of API responses and external data

## Architecture — The Pipeline
The system runs as a 4-phase automated pipeline:

1. **RESEARCH** — Scrape/analyze Gumroad discover page, trending products, top sellers, reviews, pricing
2. **ANALYZE** — Use Claude with full market context to identify gaps and high-opportunity niches
3. **GENERATE** — Create the actual digital product + listing copy + thumbnail description
4. **PUBLISH** — Deploy to Gumroad via API, set pricing, categorize, activate

Each phase logs to Supabase. The dashboard shows pipeline status, products created, and sales data.

## Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Main control panel UI
│   ├── products/           # Product management views
│   ├── analytics/          # Sales and performance tracking
│   └── api/                # API routes
│       ├── pipeline/       # Pipeline orchestration endpoints
│       ├── research/       # Market research endpoints
│       ├── generate/       # Product generation endpoints
│       ├── publish/        # Gumroad publishing endpoints
│       └── webhooks/       # Gumroad webhook handlers
├── lib/
│   ├── ai/                 # Claude API integration
│   │   ├── researcher.ts   # Market research agent
│   │   ├── analyzer.ts     # Gap analysis agent
│   │   ├── generator.ts    # Product content generator
│   │   └── copywriter.ts   # Listing copy generator
│   ├── gumroad/            # Gumroad API client
│   ├── supabase/           # Database client and queries
│   ├── pipeline/           # Pipeline orchestration logic
│   └── utils/              # Shared utilities
├── types/                  # TypeScript type definitions
└── config/                 # Configuration files
supabase/
└── migrations/             # Database migrations
tests/                      # Test files
```

## Commands
- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript compiler check
- `npx supabase db push` — Push database migrations

## Code Standards
- ES modules (import/export) only, never CommonJS
- All functions must have TypeScript return types
- Zod for runtime validation of all API responses and external data
- Environment variables in `.env.local`, validated at startup with Zod
- Keep components under 200 lines; split if larger

## Rules
- ALWAYS run `npm run typecheck` after making code changes
- ALWAYS add Zod input validation when creating new API routes
- ALWAYS handle Gumroad API rate limits with exponential backoff
- ALWAYS validate Claude API output structure before proceeding in the pipeline
- Write tests for pipeline logic — it is the core business logic
