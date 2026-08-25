-- Let any PO author read the site engineers' contact details.
--
-- The PO PDF prints "Contact at site" so the vendor's driver has someone to
-- call. ProcurementDetail built that list by reading user_security_profiles
-- directly, but its SELECT policy is `user_id = auth.uid()` — only admins can
-- see anyone else's row. So the contacts appeared when an admin generated the
-- PO and vanished for everyone else, silently: the lookup is wrapped in a
-- try/catch that lets the PO generate without contacts.
--
-- Widening the RLS on a permissions table to fix a PDF would be the wrong
-- trade. This exposes exactly two fields for one role instead.

CREATE OR REPLACE FUNCTION public.po_site_contacts()
RETURNS TABLE(name text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.full_name, u.phone
  FROM users u
  JOIN user_security_profiles usp ON usp.user_id = u.id
  JOIN security_profiles sp ON sp.id = usp.profile_id
  WHERE sp.name = 'Site Engineer'
    AND COALESCE(u.is_active, false) = true
    AND NULLIF(TRIM(COALESCE(u.full_name, '')), '') IS NOT NULL
  ORDER BY u.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.po_site_contacts() TO authenticated;
