-- Explicit Data API grants for the CPGist compact dataset.
-- Supabase is moving existing projects to explicit public-schema grants on 2026-10-30.
do $$
declare t text;
begin
  foreach t in array array[
    'cpgist_brands','cpgist_retailers','cpgist_categories','cpgist_regions','cpgist_products',
    'cpgist_brand_weekly','cpgist_category_weekly','cpgist_retailer_weekly',
    'cpgist_brand_retailer_weekly','cpgist_product_weekly','cpgist_brand_category_weekly',
    'cpgist_competitor_weekly','cpgist_product_summary','cpgist_brand_retailer_summary'
  ] loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;
