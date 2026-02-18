# SPEC.md — Etsy Spreadsheet Template Factory

## Overview
An automated pipeline that researches Etsy market opportunities, generates high-quality spreadsheet templates (.xlsx), creates optimized listing copy and images, and publishes them to Etsy via the Open API v3. Includes a full dashboard for managing the pipeline, reviewing products, and tracking sales analytics.

## Decisions

| Decision | Choice |
|---|---|
| Product type | Spreadsheet templates (.xlsx) |
| Target niche | No bias — let research phase find the best gaps |
| Pricing strategy | Dynamic per product ($10-40), set by analyzer based on competitor data |
| Automation level | Fully automated end-to-end (research → publish) |
| Throughput target | 1-2 products/day |
| Pipeline scheduling | Manual trigger from dashboard |
| Research approach | Hybrid: Etsy search API for real data + Claude for deep analysis |
| QA strategy | Self-evaluation (Claude rates output against 5 spreadsheet dimensions) |
| Quality failure handling | Auto-retry up to 3x with tweaked prompts, then flag for manual review |
| AI models | Opus 4.6 for all pipeline phases |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel (frontend) + Railway (backend) |
| Analytics | Etsy receipts API for sales tracking |
| Dashboard | Full UI with charts, filtering, product editing, Etsy OAuth management |

---

## Architecture

### Pipeline Phases

```
[RESEARCH] → [ANALYZE] → [GENERATE] → [QA] → [PUBLISH]
```

Products flow through statuses:

```
researched → analyzed → generating → qa_pending → qa_pass / qa_fail → ready_for_review → approved → publishing → published / publish_failed
```

Failed states: `qa_fail` (after 3 retries), `publish_failed` (Etsy API error). Both are recoverable from the dashboard.

### Phase 1: RESEARCH
- **Trigger:** Manual from dashboard ("Run Research" button) or keyword-seeded
- **Input:** Optional keyword seeds, or no filter (broad scan with default queries)
- **Process:**
  1. Call Etsy search API with 10 query variations ("spreadsheet template", "excel template", "budget tracker spreadsheet", etc.)
  2. Collect 30-40 real listings with structured data (price, favorites, views, tags, reviews)
  3. Pass to Claude Opus for deep analysis of market patterns, pricing, tag strategies, quality gaps
- **Output:** Raw research data saved to `research_raw` table, real `EtsyListingData` preserved
- **Model:** Opus 4.6

### Phase 2: ANALYZE
- **Trigger:** Auto-runs after research completes
- **Input:** Raw research data with real Etsy listings
- **Process:**
  1. Claude analyzes market data to identify gaps for spreadsheet templates
  2. Scores each opportunity: demand (1-10), competition (1-10 inverse), gap size (1-10), feasibility (1-10)
  3. Feasibility considers: ExcelJS capabilities, formula complexity, Google Sheets compatibility
  4. Composite score = weighted average (demand 30%, gap 30%, feasibility 25%, competition 15%)
  5. Recommends top 5 opportunities with rationale including 13 Etsy tags
- **Output:** Research report saved to `research_reports` table with scored opportunities
- **Constraints:** All opportunities must be `product_type: "spreadsheet_template"`, price range $10-40

### Phase 3: GENERATE
- **Trigger:** Manual from dashboard ("Generate Product" on a specific opportunity)
- **Input:** A scored opportunity from analysis
- **Process (multi-call architecture):**
  1. **Blueprint call** (Opus, thinking enabled): Designs full spreadsheet structure
     - Title (keyword-first, under 140 chars for Etsy)
     - Description (full Etsy listing copy with What You Get, Who It's For, How to Use, AI disclosure)
     - 13 Etsy tags (long-tail, no plurals, no title repeats)
     - Price ($10-40 based on competitor analysis)
     - Taxonomy ID (Etsy category)
     - Thumbnail prompt + 4 preview image prompts
     - 3-7 sheet plans with column layouts and formula plans
     - Professional color scheme
  2. **Parallel sheet calls** (Opus, one per sheet): Complete SheetSpec with columns, rows (data + formulas), merged cells, frozen panes, protected ranges, conditional formatting
  3. **Assembly**: Combine into GeneratedProduct with SpreadsheetSpec content
- **Output:** Product record in `products` table with status `generating` → `qa_pending`
- **Constraints:**
  - First sheet MUST be "Instructions"
  - Google Sheets compatible: NO data validation dropdowns, NO macros, NO VBA, NO pivot tables
  - Standard formulas only: SUM, AVERAGE, IF, SUMIF, SUMIFS, VLOOKUP, COUNTIF, MAX, MIN, TODAY, TEXT, CONCATENATE
  - 5-10 rows of realistic sample data
  - Formula cells marked as protected ranges

### Phase 4: QA (Self-Evaluation)
- **Trigger:** Auto-runs after generation completes
- **Input:** SpreadsheetSpec JSON (evaluated at specification level)
- **Process:**
  1. Claude evaluates the spreadsheet spec against 5 dimensions:
     - `structure_quality` (1-10) — sheet organization, column layout, logical data flow
     - `formula_correctness` (1-10) — formulas valid, no circular refs, correct references
     - `visual_design` (1-10) — professional formatting, consistent colors, readability
     - `usability` (1-10) — intuitive for non-technical users, clear labels, instructions sheet
     - `listing_copy` (1-10) — Etsy SEO title, 13 effective tags, value-selling description
  2. Pass criteria: all scores >= 6, average >= 7
  3. On fail: auto-retry generation with feedback incorporated (up to 3 attempts)
  4. After 3 failures: mark as `qa_fail` for manual intervention
  5. Lessons extracted from QA feedback for future generation improvement
- **Output:** Product status updated to `qa_pass` or `qa_fail`

### Phase 5: POST-GENERATE
- **Trigger:** Auto-runs after QA pass
- **Process:**
  1. Build .xlsx spreadsheet from SpreadsheetSpec JSON using ExcelJS builder
  2. Validate .xlsx by re-reading with ExcelJS (detect corruption)
  3. Generate 5 listing images via gpt-image-1 (1024x1024), upscale each to 2000x2000 via sharp
  4. Upload .xlsx and all images to Supabase Storage
- **Output:** Product has content_file_url (.xlsx) and image_urls (5 images)

### Phase 6: PUBLISH
- **Trigger:** Manual from dashboard ("Publish to Etsy" button) or automated
- **Input:** Product with content file and images
- **Process (fully automated, 4 steps):**
  1. Create draft listing via Etsy API (title, description, price, quantity=999, taxonomy_id, 13 tags, is_digital=true)
  2. Upload all 5 listing images via multipart upload
  3. Upload .xlsx digital file via multipart upload
  4. Activate listing (set state: "active")
- **Output:** Product live on Etsy with `etsy_listing_id` and `etsy_url`
- **On failure:** Status → `publish_failed` with specific error (which step failed), retryable

---

## Database Schema (Supabase)

### `research_raw`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| run_id | uuid | Groups data from a single research run |
| source | text | 'etsy_api', 'keyword_seed' |
| category | text | Etsy category / search query |
| product_data | jsonb | Raw EtsyListingData (title, price, favorites, views, tags, etc.) |
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
| product_type | text | 'spreadsheet_template' |
| title | text | Etsy SEO-optimized title (keywords first, under 140 chars) |
| description | text | Full Etsy listing description |
| content | jsonb | SpreadsheetSpec JSON |
| content_file_url | text | URL to .xlsx file (Supabase Storage) |
| tags | text[] | Exactly 13 Etsy tags |
| price_cents | integer | Price in cents ($10-40 range) |
| currency | text | Default 'usd' |
| thumbnail_prompt | text | Main cover image prompt |
| thumbnail_url | text | First image URL (backward compat) |
| image_urls | text[] | All 5 listing image URLs |
| qa_score | jsonb | QA evaluation results (5 dimensions) |
| qa_attempts | integer | Number of generation attempts |
| taxonomy_id | integer | Etsy category ID |
| etsy_listing_id | bigint | Etsy listing ID after publishing |
| etsy_url | text | Etsy listing URL after publishing |
| status | text | See status flow above |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `sales`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| product_id | uuid | FK → products.id |
| etsy_receipt_id | text | Etsy receipt ID |
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
| metadata | jsonb | Phase-specific details, error info, progress |
| started_at | timestamptz | |
| completed_at | timestamptz | |

### `etsy_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| access_token | text | OAuth access token |
| refresh_token | text | OAuth refresh token |
| expires_at | timestamptz | Token expiry time |
| scopes | text | Granted OAuth scopes |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `lessons`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| lesson | text | The lesson text |
| dimension | text | QA dimension (structure_quality, formula_correctness, etc.) |
| severity | integer | 1-5 |
| source_feedback | text | Original QA feedback |
| status | text | 'active', 'archived' |
| created_at | timestamptz | |

---

## Dashboard Pages

### `/dashboard` — Main Control Panel
- Pipeline status: last run time per phase, current state
- Quick actions: "Run Research", "View Opportunities", "Review Products"
- Summary stats: total products, published count, total revenue, products in queue
- Recent pipeline activity with live progress

### `/dashboard/research` — Research & Analysis
- Keyword seed input for targeted research
- List of research runs with date, source, opportunity count
- Drill into any run to see scored opportunities
- Generate product from any opportunity

### `/dashboard/products` — Product Management
- Filterable table: status, product type, date, price, tag count (X/13)
- Product detail view with spreadsheet preview (sheet structure, columns, formula counts)
- Image grid showing all 5 listing images
- Download .xlsx button
- Publish to Etsy button with progress tracking
- QA scores with 5 dimension breakdown

### `/dashboard/analytics` — Sales & Performance
- Revenue chart (daily/weekly/monthly)
- Sales per product
- Top performing products with gross and estimated net revenue
- Etsy fee breakdown (~15%: $0.20 listing + 6.5% transaction + 3% + $0.25 processing)

### `/dashboard/lessons` — QA Lessons
- Lessons extracted from QA evaluations
- Filter by status (active/archived)
- Dimension badges with color coding
- Severity levels 1-5
- Injected into generator before each run

### `/dashboard/settings` — Etsy Connection
- Connect Etsy Shop via OAuth (PKCE flow)
- Connection status indicator
- Token expiry info with reconnect button
- API configuration help

---

## API Routes

### Pipeline
- `POST /api/pipeline` — Proxy to Railway backend (research, generate, publish actions)
- `GET /api/pipeline` — List pipeline runs
- `DELETE /api/pipeline?id=` — Delete a pipeline run

### Products
- `GET /api/products` — List products with filtering
- `GET /api/products/[id]` — Product detail
- `PATCH /api/products/[id]` — Update product (edit, approve, update Etsy fields)
- `DELETE /api/products/[id]` — Delete product

### Research
- `GET /api/research/reports` — List research reports
- `GET /api/research/reports/[id]` — Report detail

### Analytics
- `GET /api/analytics/sales` — Sales data with date range
- `GET /api/analytics/summary` — Dashboard summary stats

### Etsy OAuth
- `GET /api/etsy/auth/start` — Initiate PKCE OAuth flow
- `GET /api/etsy/auth/callback` — Handle OAuth callback
- `GET /api/etsy/auth/status` — Check connection status

### Lessons
- `GET /api/lessons` — List lessons
- `PATCH /api/lessons` — Update lesson status
- `DELETE /api/lessons?id=` — Delete a lesson

---

## Tech Details

### Etsy API Integration
- **Auth:** PKCE OAuth 2.0 (access token + `x-api-key` header)
- **Public endpoints:** Search listings, get taxonomy nodes (API key only)
- **OAuth endpoints:** Create/update listings, upload images/files, get receipts
- **Token management:** Stored in `etsy_tokens` table, auto-refresh when within 5 min of expiry
- **Rate limiting:** Exponential backoff with jitter (1s base, 60s max, 5 retries)
- **Publishing:** 4-step automated flow (create draft → upload images → upload file → activate)

### Claude API Integration
- All phases use Opus 4.6
- Blueprint call uses extended thinking for better reasoning
- Sheet generation calls run in parallel (one per sheet)
- All calls use structured output (JSON mode) with Zod validation on response

### Spreadsheet Generation
- Claude generates SpreadsheetSpec JSON (sheet definitions, columns, rows, formulas, styles)
- ExcelJS builder translates spec to .xlsx deterministically
- Formulas use `{row}` placeholder, replaced with actual row numbers during build
- Sheet protection: formula cells locked, data cells unlocked
- Validation: built .xlsx is re-read by ExcelJS to detect corruption
- Google Sheets compatible: no dropdowns, no macros, standard formulas only

### Image Generation
- 5 images per product: cover, laptop mockup, feature callouts, sheet overview, compatibility graphic
- gpt-image-1 at 1024x1024, upscaled to 2000x2000 via sharp (lanczos3)
- All 5 generated in parallel via Promise.all

### Etsy Fee Structure (~15% total)
- $0.20 listing fee per item
- 6.5% transaction fee
- 3% + $0.25 payment processing fee

### Environment Variables
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ETSY_API_KEY=
ETSY_SHARED_SECRET=
ETSY_SHOP_ID=
ETSY_ACCESS_TOKEN=     # optional, populated via OAuth
ETSY_REFRESH_TOKEN=    # optional, populated via OAuth
BACKEND_URL=
BACKEND_SECRET=
FRONTEND_URL=
```

---

## Out of Scope for v1
- Multiple product types (guides, planners, etc.) — expand after spreadsheet templates work
- Auto-scheduling / cron jobs — manual trigger only for now
- Multi-marketplace support (Etsy only)
- User authentication on the dashboard (single-user, local/deployed)
- Data validation dropdowns (Google Sheets incompatible)
- Macros or VBA (not supported in Google Sheets or Etsy digital downloads)
