-- Enable RLS on all tables. No policies = block all anon/public access.
-- The service_role key (used by our backend) bypasses RLS entirely.

alter table public.research_raw enable row level security;
alter table public.research_reports enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.pipeline_runs enable row level security;
alter table public.system_lessons enable row level security;
alter table public.etsy_tokens enable row level security;
alter table public.pipeline_errors enable row level security;
