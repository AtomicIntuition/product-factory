-- 00001_initial_schema.sql
-- Initial database schema for Factory

-- =============================================================================
-- research_raw
-- =============================================================================
create table research_raw (
  id           uuid        primary key default gen_random_uuid(),
  run_id       uuid        not null,
  source       text        not null check (source in ('web_search', 'scrape', 'manual_seed')),
  category     text        not null,
  product_data jsonb       not null,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- research_reports
-- =============================================================================
create table research_reports (
  id            uuid        primary key default gen_random_uuid(),
  run_id        uuid        not null,
  opportunities jsonb       not null,
  summary       text        not null,
  status        text        not null default 'active' check (status in ('active', 'archived')),
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- products
-- =============================================================================
create table products (
  id               uuid        primary key default gen_random_uuid(),
  opportunity_id   text,
  report_id        uuid        references research_reports (id),
  product_type     text        not null,
  title            text        not null,
  description      text        not null,
  content          jsonb       not null,
  content_file_url text,
  tags             text[]      not null default '{}',
  price_cents      integer     not null,
  currency         text        not null default 'usd',
  thumbnail_prompt text,
  qa_score         jsonb,
  qa_attempts      integer     not null default 0,
  gumroad_id       text,
  gumroad_url      text,
  status           text        not null check (status in (
                      'researched',
                      'analyzed',
                      'generating',
                      'qa_pending',
                      'qa_pass',
                      'qa_fail',
                      'ready_for_review',
                      'approved',
                      'publishing',
                      'published',
                      'publish_failed'
                    )),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- sales
-- =============================================================================
create table sales (
  id              uuid        primary key default gen_random_uuid(),
  product_id      uuid        not null references products (id),
  gumroad_sale_id text        not null unique,
  amount_cents    integer     not null,
  currency        text        not null default 'usd',
  buyer_email     text,
  sale_timestamp  timestamptz not null,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- pipeline_runs
-- =============================================================================
create table pipeline_runs (
  id           uuid        primary key default gen_random_uuid(),
  phase        text        not null check (phase in ('research', 'analyze', 'generate', 'qa', 'publish')),
  status       text        not null check (status in ('running', 'completed', 'failed')),
  metadata     jsonb       not null default '{}',
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- =============================================================================
-- Indexes
-- =============================================================================
create index idx_research_raw_run_id        on research_raw (run_id);
create index idx_research_reports_run_id    on research_reports (run_id);
create index idx_products_status            on products (status);
create index idx_products_report_id         on products (report_id);
create index idx_sales_product_id           on sales (product_id);
create index idx_sales_sale_timestamp       on sales (sale_timestamp);
create index idx_pipeline_runs_phase        on pipeline_runs (phase);
