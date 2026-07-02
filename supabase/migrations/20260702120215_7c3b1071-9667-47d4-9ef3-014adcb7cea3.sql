ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS annual_revenue numeric,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS salesforce_id text;

CREATE UNIQUE INDEX IF NOT EXISTS vendors_salesforce_id_key
  ON public.vendors (salesforce_id)
  WHERE salesforce_id IS NOT NULL;

-- Relax the phone trigger: phone is no longer required, but any phone that is
-- present must remain unique across vendors.
CREATE OR REPLACE FUNCTION public.check_vendor_phone_unique()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  phone_val text;
  existing_id uuid;
BEGIN
  IF NEW.phone IS NULL OR jsonb_array_length(NEW.phone) = 0 THEN
    RETURN NEW;
  END IF;

  FOR phone_val IN SELECT jsonb_array_elements_text(NEW.phone)
  LOOP
    IF phone_val IS NULL OR btrim(phone_val) = '' THEN
      CONTINUE;
    END IF;

    SELECT v.id INTO existing_id
    FROM public.vendors v
    WHERE v.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND v.phone @> jsonb_build_array(phone_val);

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Phone number % already exists for another vendor', phone_val;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;