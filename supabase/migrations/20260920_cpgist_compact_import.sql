-- CPGist compact dataset: authenticated import + small client-facing summary tables
do $$
declare t text;
begin
  foreach t in array array[
    'cpgist_brands','cpgist_retailers','cpgist_categories','cpgist_regions','cpgist_products',
    'cpgist_brand_weekly','cpgist_category_weekly','cpgist_retailer_weekly',
    'cpgist_brand_retailer_weekly','cpgist_product_weekly','cpgist_brand_category_weekly',
    'cpgist_competitor_weekly'
  ] loop
    execute format('drop policy if exists cpgist_write_auth on public.%I', t);
    execute format('create policy cpgist_write_auth on public.%I for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)', t);
  end loop;
end $$;

create table if not exists public.cpgist_product_summary (
  product_id bigint primary key,
  brand_id bigint,
  period_end date not null,
  sales_13w numeric not null default 0,
  units_13w numeric not null default 0,
  avg_price_13w numeric,
  distribution_13w numeric,
  promo_rate_13w numeric
);
alter table public.cpgist_product_summary enable row level security;
drop policy if exists cpgist_read_auth on public.cpgist_product_summary;
create policy cpgist_read_auth on public.cpgist_product_summary for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists cpgist_write_auth on public.cpgist_product_summary;
create policy cpgist_write_auth on public.cpgist_product_summary for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create table if not exists public.cpgist_brand_retailer_summary (
  brand_id bigint not null,
  retailer_id bigint not null,
  category text,
  period_end date not null,
  sales_13w numeric not null default 0,
  units_13w numeric not null default 0,
  avg_price_13w numeric,
  distribution_13w numeric,
  promo_rate_13w numeric,
  primary key (brand_id, retailer_id)
);
alter table public.cpgist_brand_retailer_summary enable row level security;
drop policy if exists cpgist_read_auth on public.cpgist_brand_retailer_summary;
create policy cpgist_read_auth on public.cpgist_brand_retailer_summary for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists cpgist_write_auth on public.cpgist_brand_retailer_summary;
create policy cpgist_write_auth on public.cpgist_brand_retailer_summary for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create index if not exists cpgist_product_summary_brand_idx on public.cpgist_product_summary(brand_id);
create index if not exists cpgist_brand_retailer_summary_retailer_idx on public.cpgist_brand_retailer_summary(retailer_id);
