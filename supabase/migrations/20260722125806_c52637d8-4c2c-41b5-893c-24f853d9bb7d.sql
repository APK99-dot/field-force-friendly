CREATE OR REPLACE FUNCTION public.prevent_app_user_delete_from_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF COALESCE(v_claim_role, '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Users must be deactivated, not deleted, to preserve history';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_app_user_delete_from_client ON public.users;
CREATE TRIGGER prevent_app_user_delete_from_client
BEFORE DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_app_user_delete_from_client();