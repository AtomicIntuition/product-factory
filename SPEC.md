# SPEC.md — Gumroad Product Factory

## Overview
An automated pipeline that researches Gumroad market opportunities, generates high-quality digital products (starting with prompt packs), and publishes them via the Gumroad API. Includes a full dashboard for managing the pipeline, reviewing products, and tracking sales analytics.

## Decisions from Interview

| Decision | Choice |
|---|---|
| Starting product type | Prompt packs (expand later) |
| Target niche | No bias — let research phase find the best gaps |
| Pricing strategy | Dynamic per product, set by analyzer based on competitor data |
| Automation level | Manual review now, auto-publish later |
| Throughput target | 1-2 products/day |
| Pipeline scheduling | Manual trigger from dashboard |
| Research approach | Hybrid: Claude web search + manual seed data + scraping if feasible |
| QA strategy | Self-evaluation (Claude rates its own output against criteria) |
| Quality failure handling | Auto-retry up to 3x with tweaked prompts, then flag for manual review |
| AI models | Opus 4.6 for research/analysis, Sonnet 4.5 for generation |
| Database | Supabase (new project to create) |
| Deployment | Vercel |
| Analytics | Include in v1 with Gumroad webhooks |
| Dashboard | Full UI with charts, filtering, product editing |

---

## Architecture

### Pipeline Phases

```
[RESEARCH] → [ANALYZE] → [GENERATE] → [QA] → [REVIEW] → [PUBLISH]
```

Each phase is a discrete step triggered manually from the dashboard. Products flow through statuses:

```
researched → analyzed → generating → qa_pass / qa_fail → ready_for_review → approved → publishing → published / publish_failed
```

Failed states: `qa_fail` (after 3 retries), `publish_failed` (Gumroad API error). Both are recoverable from the dashboard.

### Phase 1: RESEARCH
- **Trigger:** Manual from dashboard ("Run Research" button)
- **Input:** Optional niche filter, or no filter (broad scan)
- **Process:**
  1. Use Claude web search to scan Gumroad discover/trending pages
  2. Incorporate any manual seed URLs the user has added
  3. Scrape product data if Gumroad allows (check robots.txt, fall back to search-only)
  4. Collect: product titles, descriptions, pricing, ratings, review counts, seller info, category
- **Output:** Raw research data saved to `research_raw` table
- **Model:** Opus 4.6

### Phase 2: ANALYZE
- **Trigger:** Auto-runs after research completes
- **Input:** Raw research data
- **Process:**
  1. Claude analyzes market data to identify gaps and opportunities
  2. Scores each opportunity: demand (1-10), competition (1-10 inverse), gap size (1-10), feasibility (1-10)
  3. Composite score = weighted average (demand 30%, gap 30%, feasibility 25%, competition 15%)
  4. Recommends top 5 opportunities with rationale
- **Output:** Research report saved to `research_reports` table with scored opportunities
- **Model:** Opus 4.6

### Phase 3: GENERATE
- **Trigger:** Manual from dashboard ("Generate Product" on a specific opportunity)
- **Input:** A scored opportunity from analysis
- **Process:**
  1. Determine product format (for prompt packs: number of prompts, categories, structure)
  2. Generate the actual product content — the prompt pack itself
  3. Generate listing copy: SEO title, benefit-driven description, tags (max 5)
  4. Set price based on competitor analysis from research data
  5. Generate thumbnail description for image generation
- **Output:** Product record in `products` table with status `generating` → `qa_pending`
- **Model:** Sonnet 4.5 for content generation

### Phase 4: QA (Self-Evaluation)
- **Trigger:** Auto-runs after generation completes
- **Input:** Generated product content
- **Process:**
  1. Claude evaluates the product against quality criteria:
     - Content length (minimum thresholds per product type)
     - Uniqueness (no duplicate/near-duplicate prompts within the pack)
     - Relevance (prompts match the stated niche/category)
     - Quality (prompts are specific, actionable, not generic)
     - Listing copy (title is compelling, description sells benefits)
  2. Assigns pass/fail with detailed feedback
  3. On fail: auto-retry generation with feedback incorporated (up to 3 attempts)
  4. After 3 failures: mark as `qa_fail` for manual intervention
- **Output:** Product status updated to `qa_pass` or `qa_fail`
- **Model:** Opus 4.6 (different model than generator for better evaluation)

### Phase 5: REVIEW
- **Trigger:** Manual — user reviews from dashboard
- **Input:** Product with status `ready_for_review`
- **Process:**
  1. Dashboard shows full product preview: content, listing copy, pricing, thumbnail description
  2. User can: approve, edit inline, reject, or send back for regeneration
  3. On approve: status → `approved`
- **Output:** Product status updated

### Phase 6: PUBLISH
- **Trigger:** Manual from dashboard ("Publish" button on approved product)
- **Input:** Approved product
- **Process:**
  1. Validate all required fields present
  2. Create product via Gumroad API (`POST /products`)
  3. Upload product file (PDF/ZIP of prompt pack)
  4. Set price, tags, categorization
  5. Activate product (set `published: true`)
  6. Store Gumroad product ID and URL
  7. On failure: status → `publish_failed` with error details, retryable from dashboard
- **Output:** Product live on Gumroad, status → `published`
- **Rate limits:** Respect Gumroad API limits with exponential backoff (base 1s, max 60s)

---

## Database Schema (Supabase)

### `research_raw`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| run_id | uuid | Groups data from a single research run |
| source | text | 'web_search', 'scrape', 'manual_seed' |
| category | text | Gumroad category |
| product_data | jsonb | Raw product info (title, price, ratings, etc.) |
| created_at | timestamptz | |

### `research_reports`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| run_id | uuid | FK → research_raw.run_id |
| opportunities | jsonb | Array of scored opportunities |
| summary | text | High-level analysis text |
| status | text | 'active', 'archived' |
| created_at | timestamptz | |

### `products`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| opportunity_id | uuid | Which opportunity this fulfills |
| report_id | uuid | FK → research_reports.id |
| product_type | text | 'prompt_pack', 'template', etc. |
| title | text | SEO-optimized title |
| description | text | Listing description |
| content | jsonb | The actual product content |
| content_file_url | text | URL to generated file (Supabase Storage) |
| tags | text[] | Up to 5 tags |
| price_cents | integer | Price in cents |
| currency | text | Default 'usd' |
| thumbnail_prompt | text | Description for image generation |
| qa_score | jsonb | QA evaluation results |
| qa_attempts | integer | Number of generation attempts |
| gumroad_id | text | Gumroad product ID after publishing |
| gumroad_url | text | Gumroad product URL after publishing |
| status | text | See status flow above |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `sales`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| product_id | uuid | FK → products.id |
| gumroad_sale_id | text | Gumroad's sale ID |
| amount_cents | integer | Sale amount |
| currency | text | |
| buyer_email | text | Hashed or anonymized |
| sale_timestamp | timestamptz | When the sale happened |
| created_at | timestamptz | |

### `pipeline_runs`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| phase | text | 'research', 'analyze', 'generate', 'qa', 'publish' |
| status | text | 'running', 'completed', 'failed' |
| metadata | jsonb | Phase-specific details, error info |
| started_at | timestamptz | |
| completed_at | timestamptz | |

---

## Dashboard Pages

### `/dashboard` — Main Control Panel
- Pipeline status: last run time per phase, current state
- Quick actions: "Run Research", "View Opportunities", "Review Products"
- Summary stats: total products, published count, total revenue, products in queue
- Recent activity feed

### `/dashboard/research` — Research & Analysis
- List of research runs with date, source, opportunity count
- Drill into any run to see scored opportunities
- Button to trigger new research run (with optional niche filter)
- Manual seed URL input

### `/dashboard/products` — Product Management
- Filterable table: status, product type, date, price
- Product detail view with full content preview
- Inline editing of title, description, price, tags
- Action buttons per status: Generate, Approve, Reject, Publish, Retry

### `/dashboard/analytics` — Sales & Performance
- Revenue chart (daily/weekly/monthly)
- Sales per product
- Top performing products
- Conversion data if available from Gumroad

---

## API Routes

### Pipeline
- `POST /api/pipeline/research` — Trigger research phase
- `POST /api/pipeline/generate` — Trigger generation for a specific opportunity
- `POST /api/pipeline/publish` — Publish approved product to Gumroad
- `GET /api/pipeline/status` — Current pipeline state

### Products
- `GET /api/products` — List products with filtering
- `GET /api/products/[id]` — Product detail
- `PATCH /api/products/[id]` — Update product (edit, approve, reject)
- `DELETE /api/products/[id]` — Delete product

### Research
- `GET /api/research/reports` — List research reports
- `GET /api/research/reports/[id]` — Report detail
- `POST /api/research/seeds` — Add manual seed URLs

### Analytics
- `GET /api/analytics/sales` — Sales data with date range
- `GET /api/analytics/summary` — Dashboard summary stats

### Webhooks
- `POST /api/webhooks/gumroad` — Gumroad sale/refund webhook handler

---

## Tech Details

### Gumroad API Integration
- Auth: API token in `Authorization` header
- Product creation: `POST https://api.gumroad.com/v2/products`
- File upload: multipart form data
- Rate limiting: implement queue with exponential backoff (1s base, 60s max, 5 retries)
- Webhook verification: validate `seller_id` matches our account

### Claude API Integration
- Research/Analysis: Opus 4.6 — needs reasoning capability for market analysis
- Generation: Sonnet 4.5 — fast, good quality for content creation
- QA Evaluation: Opus 4.6 — different model than generator to avoid self-bias
- All calls use structured output (JSON mode) with Zod validation on response

### Product File Generation
- Prompt packs: Generate as structured JSON → convert to formatted PDF
- Use a library like `jspdf` or `@react-pdf/renderer` for PDF generation
- Store generated files in Supabase Storage
- Upload to Gumroad from storage URL during publish

### Environment Variables
```
ANTHROPIC_API_KEY=
GUMROAD_API_TOKEN=
GUMROAD_SELLER_ID=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GUMROAD_WEBHOOK_SECRET=
```

---

## Build Order

### Phase 1: Foundation
1. Initialize Next.js 14 project with TypeScript, Tailwind, App Router
2. Set up Supabase project and run migrations for all tables
3. Set up environment variables with Zod validation
4. Create Supabase client library (`lib/supabase/`)
5. Create Gumroad API client with rate limiting (`lib/gumroad/`)
6. Create Claude API wrapper (`lib/ai/`)

### Phase 2: Pipeline Core
7. Build research agent (`lib/ai/researcher.ts`)
8. Build analysis agent (`lib/ai/analyzer.ts`)
9. Build generation agent (`lib/ai/generator.ts`) — prompt packs only
10. Build QA evaluator (`lib/ai/evaluator.ts`)
11. Build copywriter agent (`lib/ai/copywriter.ts`)
12. Build pipeline orchestrator (`lib/pipeline/`)
13. Build all API routes

### Phase 3: Dashboard
14. Layout shell with navigation
15. Main dashboard page with stats and quick actions
16. Research page with run history and opportunity viewer
17. Products page with filterable table and detail/edit views
18. Publish flow (approval → Gumroad publish)
19. Analytics page with charts

### Phase 4: Webhooks & Analytics
20. Gumroad webhook handler for sales
21. Sales data ingestion and storage
22. Analytics API routes
23. Analytics dashboard charts

### Phase 5: Polish
24. Error handling and retry UI
25. Loading states and optimistic updates
26. PDF generation for prompt packs
27. End-to-end testing of full pipeline flow

---

## Out of Scope for v1
- Multiple product types (templates, guides, etc.) — expand after prompt packs work
- Auto-scheduling / cron jobs — manual trigger only for now
- Auto-publish without review
- Thumbnail image generation (description only for now)
- Multi-marketplace support (Gumroad only)
- User authentication on the dashboard (single-user, local/deployed)
