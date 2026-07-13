-- Vendor quote portal tables
CREATE TABLE public.procurement_vendor_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  status TEXT NOT NULL DEFAULT 'sent',
  vendor_payment_term TEXT,
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (po_id, vendor_id)
);

CREATE TABLE public.procurement_vendor_quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.procurement_vendor_quotes(id) ON DELETE CASCADE,
  procurement_item_id UUID REFERENCES public.procurement_items(id) ON DELETE CASCADE,
  rate NUMERIC NOT NULL DEFAULT 0,
  discount_pct NUMERIC NOT NULL DEFAULT 0,
  rate_after_discount NUMERIC NOT NULL DEFAULT 0,
  delivery_commitment_date DATE,
  is_selected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (quote_id, procurement_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_vendor_quotes TO authenticated;
GRANT ALL ON public.procurement_vendor_quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_vendor_quote_items TO authenticated;
GRANT ALL ON public.procurement_vendor_quote_items TO service_role;

ALTER TABLE public.procurement_vendor_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_vendor_quote_items ENABLE ROW LEVEL SECURITY;

-- Authenticated app users (procurement staff) can manage quotes
CREATE POLICY "Authenticated can view vendor quotes"
  ON public.procurement_vendor_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert vendor quotes"
  ON public.procurement_vendor_quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update vendor quotes"
  ON public.procurement_vendor_quotes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete vendor quotes"
  ON public.procurement_vendor_quotes FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can view vendor quote items"
  ON public.procurement_vendor_quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert vendor quote items"
  ON public.procurement_vendor_quote_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update vendor quote items"
  ON public.procurement_vendor_quote_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete vendor quote items"
  ON public.procurement_vendor_quote_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_pvq_updated_at BEFORE UPDATE ON public.procurement_vendor_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pvqi_updated_at BEFORE UPDATE ON public.procurement_vendor_quote_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();