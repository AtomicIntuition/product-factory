create table system_lessons (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid references products(id) on delete set null,
  phase            text not null check (phase in ('generation', 'qa', 'research')),
  lesson           text not null,
  dimension        text,
  severity         integer not null default 3 check (severity between 1 and 5),
  source_feedback  text,
  status           text not null default 'active' check (status in ('active', 'archived')),
  created_at       timestamptz not null default now()
);

create index idx_system_lessons_phase_status on system_lessons (phase, status);
create index idx_system_lessons_severity on system_lessons (severity desc);
