
ALTER TABLE public.procurement_orders ADD COLUMN IF NOT EXISTS requisition_number text;
CREATE SEQUENCE IF NOT EXISTS public.procurement_requisition_seq START 1;

-- Backfill existing rows in creation order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.procurement_orders
  WHERE requisition_number IS NULL
)
UPDATE public.procurement_orders p
SET requisition_number = 'REQ-' || LPAD(o.rn::text, 4, '0')
FROM ordered o
WHERE p.id = o.id;

-- Advance sequence past backfilled values
SELECT setval('public.procurement_requisition_seq', GREATEST((SELECT count(*) FROM public.procurement_orders), 1));

-- Trigger to assign requisition_number on insert
CREATE OR REPLACE FUNCTION public.set_requisition_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requisition_number IS NULL OR NEW.requisition_number = '' THEN
    NEW.requisition_number := 'REQ-' || LPAD(nextval('public.procurement_requisition_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_requisition_number ON public.procurement_orders;
CREATE TRIGGER trg_set_requisition_number
BEFORE INSERT ON public.procurement_orders
FOR EACH ROW EXECUTE FUNCTION public.set_requisition_number();
