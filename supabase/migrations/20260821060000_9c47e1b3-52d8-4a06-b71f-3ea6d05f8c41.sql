-- Let projects/sites editors create and manage sites, not only admins.
--
-- A site engineer adding a site hit
--
--   new row violates row-level security policy for table "project_sites"
--
-- The permissive INSERT policy from 20260303120618 is not on the live database
-- — removed by a later hardening pass — leaving admin-only management. Rather
-- than restore WITH CHECK (true), which let any authenticated user create a
-- site, this ties it to the permission the app already has for the module.
--
-- module_projects_sites is in the Security & Access matrix, so access is
-- granted per profile in the UI instead of by making someone an admin, which
-- would also hand over user management and security settings.
--
-- Reading is untouched: the "Users can view assigned sites" policy from
-- 20260305044809 still governs who sees which site.

DROP POLICY IF EXISTS "Authenticated can insert project_sites" ON public.project_sites;
DROP POLICY IF EXISTS "Site editors manage project_sites" ON public.project_sites;

CREATE POLICY "Site editors manage project_sites"
  ON public.project_sites FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_projects_sites', 'edit')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_projects_sites', 'edit')
  );

-- Creating a site assigns people to it in the same step, so the assignment
-- insert must be allowed for the same people or Create Site half-succeeds.
DROP POLICY IF EXISTS "Site editors manage site_assignments" ON public.site_assignments;
CREATE POLICY "Site editors manage site_assignments"
  ON public.site_assignments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_projects_sites', 'edit')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_projects_sites', 'edit')
  );
