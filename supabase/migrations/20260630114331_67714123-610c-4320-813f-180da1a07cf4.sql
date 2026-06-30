ALTER TABLE public.procurement_orders
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'vendor',
  ADD COLUMN IF NOT EXISTS transfer_from_site_id uuid;

CREATE SEQUENCE IF NOT EXISTS public.trf_number_seq;

CREATE OR REPLACE FUNCTION public.set_po_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Generate a number the first time the order leaves the Requisition stage
  IF NEW.po_number IS NULL AND NEW.status <> 'Requisition' THEN
    IF NEW.source_type = 'internal_transfer' THEN
      NEW.po_number := 'TRF-' || lpad(nextval('public.trf_number_seq')::text, 4, '0');
    ELSE
      NEW.po_number := 'PO-' || lpad(nextval('public.po_number_seq')::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.procurement_orders SET source_type = 'vendor' WHERE source_type IS NULL;