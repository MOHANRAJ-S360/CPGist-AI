-- These functions truncate/rebuild shared production datasets. Only the server-side admin API may invoke them.
revoke all on function public.cpgist_reset_import_dataset() from public, anon, authenticated;
grant execute on function public.cpgist_reset_import_dataset() to service_role;

revoke all on function public.cpgist_rebuild_competitor_weekly() from public, anon, authenticated;
grant execute on function public.cpgist_rebuild_competitor_weekly() to service_role;
