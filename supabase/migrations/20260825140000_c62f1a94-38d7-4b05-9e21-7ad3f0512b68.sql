-- Let non-admins add vendors.
--
-- Two separate gaps: the Accountant profile had no module_vendors permission,
-- and public.vendors had no INSERT/UPDATE policy at all for anyone but admins
-- ("Admins can manage all vendors" ALL, plus a read-only policy for everyone
-- else). Granting the permission without the policy would surface the button
-- and then fail on save.

-- 1. Permission -------------------------------------------------------------
-- UPDATE-then-INSERT rather than ON CONFLICT: the live table has no unique
-- constraint on (profile_id, object_name).
UPDATE public.profile_object_permissions pop
   SET can_read = true, can_create = true, can_edit = true
  FROM public.security_profiles sp
 WHERE sp.id = pop.profile_id
   AND sp.name = 'Accountant'
   AND pop.object_name = 'module_vendors';

INSERT INTO public.profile_object_permissions
  (profile_id, object_name, can_read, can_create, can_edit)
SELECT sp.id, 'module_vendors', true, true, true
  FROM public.security_profiles sp
 WHERE sp.name = 'Accountant'
   AND NOT EXISTS (
     SELECT 1 FROM public.profile_object_permissions p
      WHERE p.profile_id = sp.id AND p.object_name = 'module_vendors'
   );

-- 2. RLS --------------------------------------------------------------------
-- Separate INSERT and UPDATE policies rather than FOR ALL, so nobody gains
-- DELETE: removing a vendor with purchase orders against it is an admin
-- decision. Postgres ORs permissive policies, so the existing admin policy
-- and the read policy are unaffected.
DROP POLICY IF EXISTS "Vendor staff can add vendors" ON public.vendors;
CREATE POLICY "Vendor staff can add vendors"
  ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_vendors', 'edit')
    OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
  );

DROP POLICY IF EXISTS "Vendor staff can edit vendors" ON public.vendors;
CREATE POLICY "Vendor staff can edit vendors"
  ON public.vendors FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_vendors', 'edit')
    OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
  );
