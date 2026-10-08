-- Coach NPS: one row per call-level NPS rating, mirrored from BigQuery
-- (leverage_direct.call_nps = PRE-sales) by api/crm-leads.js's call_nps_sync mode.
-- `stage` is part of the primary key so a future post-sales table can be loaded
-- into this same table without id collisions. RLS is ON (no policies) unlike the other
-- cache tables: this one holds student ids and review text, and the public anon key
-- must NOT be able to read it, or the per-person scoping could be bypassed. The service
-- role used by the API ignores RLS, so nothing else is affected. Also: the browser never reads this table directly, only
-- api/crm-leads.js (service role) does, and it applies the per-person access
-- scoping before anything is returned.

create table if not exists public.call_nps_feed (
  stage          text        not null default 'pre',
  id             bigint      not null,
  rated_at       timestamptz,
  rated_date     date        not null,
  coach_email    text        not null,
  coach_name     text,
  coach_id       bigint,
  rating         int         not null,
  student_id     text,
  prospect_id    text,
  opportunity_id text,
  call_id        text,
  call_type      text,
  call_status    text,
  source         text,
  duration       int,
  review         text,
  rating_url     text,
  sync_id        text,
  synced_at      timestamptz not null default now(),
  primary key (stage, id)
);

alter table public.call_nps_feed enable row level security;

create index if not exists call_nps_feed_date_idx  on public.call_nps_feed (rated_date);
create index if not exists call_nps_feed_coach_idx on public.call_nps_feed (coach_email, rated_date);

-- One call for the whole dashboard. NPS buckets: promoter 9-10, passive 7-8,
-- detractor 0-6. p_emails = the coaches the caller is allowed to see (NULL = all,
-- admins only -- the API decides). Everything except by_month is limited to
-- p_from..p_to; by_month covers the full history of the allowed coaches so the
-- month-on-month view never depends on the date picker.
create or replace function public.coach_nps_summary(p_from date, p_to date, p_emails text[] default null)
returns jsonb
language sql
stable
as $$
  with scoped as (
    select * from public.call_nps_feed
    where p_emails is null or coach_email = any(p_emails)
  ),
  ranged as (
    select * from scoped where rated_date between p_from and p_to
  )
  select jsonb_build_object(
    'overall', coalesce((
      select jsonb_agg(t) from (
        select stage,
               count(*)                                    as total,
               count(distinct student_id)                  as students,
               round(avg(rating)::numeric, 2)              as avg,
               count(*) filter (where rating >= 9)         as promoters,
               count(*) filter (where rating between 7 and 8) as passives,
               count(*) filter (where rating <= 6)         as detractors
        from ranged group by stage
      ) t), '[]'::jsonb),
    'by_coach', coalesce((
      select jsonb_agg(t) from (
        select stage, coach_email,
               max(coach_name)                             as coach_name,
               count(*)                                    as total,
               count(distinct student_id)                  as students,
               round(avg(rating)::numeric, 2)              as avg,
               count(*) filter (where rating >= 9)         as promoters,
               count(*) filter (where rating between 7 and 8) as passives,
               count(*) filter (where rating <= 6)         as detractors
        from ranged group by stage, coach_email
      ) t), '[]'::jsonb),
    'distribution', coalesce((
      select jsonb_agg(t) from (
        select stage, rating, count(*) as n
        from ranged group by stage, rating
      ) t), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(t) from (
        select stage, to_char(rated_date, 'YYYY-MM-DD') as d,
               count(*)                                    as total,
               count(*) filter (where rating >= 9)         as promoters,
               count(*) filter (where rating between 7 and 8) as passives,
               count(*) filter (where rating <= 6)         as detractors
        from ranged group by stage, rated_date order by rated_date
      ) t), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(t) from (
        select stage, to_char(rated_date, 'YYYY-MM') as m,
               count(*)                                    as total,
               count(distinct student_id)                  as students,
               count(*) filter (where rating >= 9)         as promoters,
               count(*) filter (where rating between 7 and 8) as passives,
               count(*) filter (where rating <= 6)         as detractors
        from scoped group by stage, to_char(rated_date, 'YYYY-MM') order by 2
      ) t), '[]'::jsonb),
    'bounds', (
      select jsonb_build_object(
        'min_date', to_char(min(rated_date), 'YYYY-MM-DD'),
        'max_date', to_char(max(rated_date), 'YYYY-MM-DD'),
        'synced_at', max(synced_at))
      from scoped)
  );
$$;
