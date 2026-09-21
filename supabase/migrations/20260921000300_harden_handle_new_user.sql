-- The profile-provisioning trigger function must not be directly callable
-- via PostgREST RPC by anon/authenticated roles — it should only ever run
-- as the `on_auth_user_created` trigger. Flagged by Supabase's security
-- advisor (SECURITY DEFINER function exposed in the public/exposed schema).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
