-- Put the Address Book in the main navigation, and gate the master screens.
--
-- The Vendor Master and Product Master nav tiles were declared with
-- `module: null`, which AppHeader's filter treats as "always visible" — so
-- site engineers saw both. Address Book had no tile at all and lived only in
-- the Admin Centre, which Nikhil cannot reach.
--
-- WHY NEW OBJECTS RATHER THAN REUSING module_master_data:
-- 20260819060000 made master_products writable by anyone with
-- module_master_data 'edit', which is how site engineers add a product from a
-- requisition. Gating the Product Master tile on that same object would force
-- a choice between showing them the screen and letting them create products.
-- These three objects control screen visibility only; no RLS depends on them.

-- 1. Register the objects ----------------------------------------------------
-- Seeded per profile because profile_object_permissions has no row until one
-- is granted; can_read drives nav visibility.
WITH targets(profile_name, object_name) AS (
  VALUES
    ('System Administrator', 'module_vendor_master'),
    ('System Administrator', 'module_product_master'),
    ('System Administrator', 'module_address_book'),
    ('Accountant',           'module_vendor_master'),
    ('Accountant',           'module_product_master'),
    ('Accountant',           'module_address_book')
)
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, can_read, can_create, can_edit)
SELECT sp.id, t.object_name, true, true, true
  FROM targets t
  JOIN public.security_profiles sp ON sp.name = t.profile_name
 WHERE NOT EXISTS (
   SELECT 1 FROM public.profile_object_permissions p
    WHERE p.profile_id = sp.id AND p.object_name = t.object_name
 );

-- Re-runnable: make sure an existing row is switched on.
UPDATE public.profile_object_permissions pop
   SET can_read = true, can_create = true, can_edit = true
  FROM public.security_profiles sp
 WHERE sp.id = pop.profile_id
   AND sp.name IN ('System Administrator', 'Accountant')
   AND pop.object_name IN ('module_vendor_master', 'module_product_master', 'module_address_book');

-- Site Engineer is granted nothing here, so the tiles stay hidden for Nithesh
-- and Anand. Their module_master_data 'edit' is untouched, so adding a product
-- from a requisition still works.

-- 2. Address Book writes -----------------------------------------------------
-- master_addresses had a SELECT policy for business users but no write policy
-- beyond the admin one, so the screen would open read-only for Nikhil.
DROP POLICY IF EXISTS "Address book editors add addresses" ON public.master_addresses;
CREATE POLICY "Address book editors add addresses"
  ON public.master_addresses FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_address_book', 'edit')
  );

DROP POLICY IF EXISTS "Address book editors update addresses" ON public.master_addresses;
CREATE POLICY "Address book editors update addresses"
  ON public.master_addresses FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_address_book', 'edit')
  );

-- No DELETE policy on purpose: addresses are referenced by historic POs, so
-- removing one stays an admin action. The screen's delete button will fail for
-- non-admins, which is the intended outcome.
