create table if not exists pipeline_errors (
  id uuid primary key default gen_random_uuid(),
  phase text,
  error text not null,
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index idx_pipeline_errors_created_at on pipeline_errors (created_at desc);
create index idx_pipeline_errors_phase on pipeline_errors (phase);
