CREATE TABLE public.master_uom (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uom_name TEXT NOT NULL UNIQUE,
  uom_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_uom TO authenticated;
GRANT ALL ON public.master_uom TO service_role;

ALTER TABLE public.master_uom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read uom" ON public.master_uom
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage uom" ON public.master_uom
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_master_uom_updated_at
  BEFORE UPDATE ON public.master_uom
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.master_uom (uom_name) VALUES
  ('Nos'),('No'),('Pc'),('Set'),('Box'),('Bag'),('Bags'),('Coil'),('Bundles'),('Sheets'),('Packet'),
  ('Kg'),('Kgs'),('Grams'),('MT'),('Tonne'),('M.T'),
  ('Ltr'),('Ltrs'),('L'),('CAN'),
  ('Mtr'),('Mtrs'),('M'),('Meters'),('Rmt'),('Feet'),('Ft'),('Sft'),('Smt'),('Sqft'),
  ('M3'),('CUM'),('Cmt'),('CFT'),
  ('Days'),('Hrs'),('Trips'),('Load'),('Loads'),('LS'),('Lumsum')
ON CONFLICT (uom_name) DO NOTHING;