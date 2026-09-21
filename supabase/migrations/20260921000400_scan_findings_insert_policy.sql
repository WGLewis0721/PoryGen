-- scan_findings had a SELECT policy but no INSERT policy, so the
-- scan-repository Edge Function (which writes findings using the calling
-- user's own JWT, not a service role) was blocked by RLS. Discovered via a
-- live smoke test against expressjs/cors.
create policy "scan_findings_insert_via_scan" on public.scan_findings
  for insert with check (
    exists (select 1 from public.scans s where s.id = scan_id and s.owner_id = auth.uid())
  );
