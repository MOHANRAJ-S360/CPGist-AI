-- CPGist v5 Free-tier extension layer.
-- Stores only pre-derived distribution/first-purchase metrics, aggregated media,
-- and sampled-market availability counts. Never imports the 2M-row raw sales fact,
-- full baseline duplicate, full store-SKU matrix, or full channel-level media fact.

create table if not exists public.cpgist_v5_distribution_efficiency_13w (
  anchor text not null check (anchor in ('ACTUAL','ALL')),
  win text not null check (win in ('L13W','P13W')),
  upc text not null,
  market_id text not null,
  geographic_scope text not null,
  category text not null,
  weeks_present smallint not null,
  dollar_sales numeric(16,2),
  unit_sales numeric(16,1),
  acv_avg numeric(7,3),
  stores_selling_avg numeric(10,2),
  velocity_units_per_store_week numeric(14,6),
  velocity_dollars_per_store_week numeric(14,6),
  sales_per_acv_point_week numeric(14,4),
  peer_median_velocity numeric(14,6),
  distribution_efficiency_index numeric(10,2),
  peer_acv_p75 numeric(7,3),
  acv_gap_points numeric(7,3),
  lost_sales_estimate_weekly numeric(14,2),
  quadrant text not null check (quadrant in ('Core','Expand Distribution','Fix Velocity','Review')),
  is_estimate boolean not null default true,
  primary key (anchor, win, upc, market_id)
);

create index if not exists cpgist_v5_dist_filter_idx
  on public.cpgist_v5_distribution_efficiency_13w(anchor, win, geographic_scope, quadrant);

create table if not exists public.cpgist_v5_first_purchase_share (
  brand text not null,
  geographic_scope text not null,
  quarter_ending date not null,
  first_observed_purchases integer not null,
  total_purchases integer not null,
  first_purchase_share numeric(7,4) not null,
  avg_price_paid_first numeric(10,4),
  avg_price_paid_repeat numeric(10,4),
  avg_size_volume_first numeric(12,2),
  avg_size_volume_repeat numeric(12,2),
  top_market_share_first numeric(7,4),
  top_market_share_repeat numeric(7,4),
  is_synthetic_flag boolean not null default true,
  low_sample boolean not null default false,
  primary key (brand, geographic_scope, quarter_ending)
);

create table if not exists public.cpgist_v5_media_channel_dictionary (
  channel text primary key,
  funnel_stage text not null,
  assumed_cpm numeric(8,2) not null,
  assumed_ctr numeric(7,4) not null,
  assumed_roas_min numeric(6,2) not null,
  assumed_roas_max numeric(6,2) not null,
  notes text
);

-- One row per brand x market x week. Channel-level facts are aggregated before storage.
create table if not exists public.cpgist_v5_media_brand_market_week (
  week_ending date not null,
  brand_id integer not null,
  market_id text not null,
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint,
  attributed_sales numeric(14,2),
  is_planned boolean not null default false,
  is_actual boolean not null default false,
  is_synthetic_flag boolean not null default true,
  primary key (week_ending, brand_id, market_id)
);

create index if not exists cpgist_v5_media_brand_week_idx
  on public.cpgist_v5_media_brand_market_week(brand_id, week_ending desc);

-- Aggregated snapshot counts only; do not persist the 1.55M-row store x UPC matrix.
create table if not exists public.cpgist_v5_availability_counts (
  week_ending date not null,
  market_id text not null,
  upc text not null,
  sampled_stores integer not null,
  listed_stores integer not null,
  in_stock_stores integer not null,
  is_synthetic_flag boolean not null default true,
  primary key (week_ending, market_id, upc),
  check (in_stock_stores <= listed_stores),
  check (listed_stores <= sampled_stores)
);

alter table public.cpgist_v5_distribution_efficiency_13w enable row level security;
alter table public.cpgist_v5_first_purchase_share enable row level security;
alter table public.cpgist_v5_media_channel_dictionary enable row level security;
alter table public.cpgist_v5_media_brand_market_week enable row level security;
alter table public.cpgist_v5_availability_counts enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'cpgist_v5_distribution_efficiency_13w',
    'cpgist_v5_first_purchase_share',
    'cpgist_v5_media_channel_dictionary',
    'cpgist_v5_media_brand_market_week',
    'cpgist_v5_availability_counts'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t || '_authenticated_all', t
    );
    execute format('grant select, insert, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- Keep 80 MiB of headroom below the 500 MiB Free-tier limit.
create or replace function public.cpgist_v5_storage_guard(p_estimated_increment_mb integer default 100)
returns table(
  current_db_bytes bigint,
  estimated_increment_bytes bigint,
  projected_db_bytes bigint,
  guard_bytes bigint,
  free_limit_bytes bigint,
  allowed boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    pg_database_size(current_database()),
    greatest(coalesce(p_estimated_increment_mb,100),0)::bigint * 1024 * 1024,
    pg_database_size(current_database()) + greatest(coalesce(p_estimated_increment_mb,100),0)::bigint * 1024 * 1024,
    420::bigint * 1024 * 1024,
    500::bigint * 1024 * 1024,
    pg_database_size(current_database()) + greatest(coalesce(p_estimated_increment_mb,100),0)::bigint * 1024 * 1024 <= 420::bigint * 1024 * 1024
$$;

create or replace function public.cpgist_v5_reset_extensions()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() not in ('authenticated','service_role') then
    raise exception 'Authentication required to reset v5 extension data';
  end if;
  truncate table
    public.cpgist_v5_availability_counts,
    public.cpgist_v5_media_brand_market_week,
    public.cpgist_v5_media_channel_dictionary,
    public.cpgist_v5_first_purchase_share,
    public.cpgist_v5_distribution_efficiency_13w;
end;
$$;

grant execute on function public.cpgist_v5_storage_guard(integer) to authenticated, service_role;
grant execute on function public.cpgist_v5_reset_extensions() to authenticated, service_role;
