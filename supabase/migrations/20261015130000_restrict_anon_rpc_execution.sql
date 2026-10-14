-- These RPCs are called by signed-in import/sign-out flows, never by anonymous visitors.
revoke all on function public.cpgist_rebuild_competitor_weekly() from public, anon;
grant execute on function public.cpgist_rebuild_competitor_weekly() to authenticated;

revoke all on function public.cpgist_reset_import_dataset() from public, anon;
grant execute on function public.cpgist_reset_import_dataset() to authenticated;
