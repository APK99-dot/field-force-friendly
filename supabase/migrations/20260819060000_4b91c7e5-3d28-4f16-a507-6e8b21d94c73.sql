-- Let master-data editors manage products, not only admins.
--
-- master_products had two policies: everyone reads, admins do everything else.
-- So a site engineer adding a product hit
--
--   new row violates row-level security policy for table "master_products"
--
-- and deleting appeared to do nothing at all — RLS filters the row out of the
-- DELETE rather than raising, so the request succeeded having changed nothing.
-- Silent, which is worse than the insert error.
--
-- The permission this should follow already exists: module_master_data, which
-- the app checks through can_access_object and which is already listed in the
-- Security & Access matrix. Tying the policy to it means access is granted per
-- profile in the UI, rather than by making someone an admin — which would also
-- hand them user management and security settings.
--
-- Reading is untouched: everyone still needs products visible to raise a
-- requisition.
--
-- NOTE: this migration only changes master_products. The other master tables
-- may well carry the same admin-only rule; they are left alone rather than
-- swept, so each is a deliberate decision rather than a side effect of this one.

DROP POLICY IF EXISTS "Admins manage products" ON public.master_products;

CREATE POLICY "Admins and master-data editors manage products"
  ON public.master_products FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_master_data', 'edit')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_master_data', 'edit')
  );
