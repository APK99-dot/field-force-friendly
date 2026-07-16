
-- ========== CRM MASTER DATA ==========
CREATE TABLE public.master_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_event_types TO authenticated;
GRANT ALL ON public.master_event_types TO service_role;
ALTER TABLE public.master_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage master_event_types" ON public.master_event_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_event_types_upd BEFORE UPDATE ON public.master_event_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.master_lead_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'gray',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_converted_status boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_lead_statuses TO authenticated;
GRANT ALL ON public.master_lead_statuses TO service_role;
ALTER TABLE public.master_lead_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage master_lead_statuses" ON public.master_lead_statuses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_lead_statuses_upd BEFORE UPDATE ON public.master_lead_statuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.master_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_lead_sources TO authenticated;
GRANT ALL ON public.master_lead_sources TO service_role;
ALTER TABLE public.master_lead_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage master_lead_sources" ON public.master_lead_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_lead_sources_upd BEFORE UPDATE ON public.master_lead_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.opportunity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_types TO authenticated;
GRANT ALL ON public.opportunity_types TO service_role;
ALTER TABLE public.opportunity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage opportunity_types" ON public.opportunity_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_opp_types_upd BEFORE UPDATE ON public.opportunity_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.opportunity_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'gray',
  sort_order integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_closed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_stages TO authenticated;
GRANT ALL ON public.opportunity_stages TO service_role;
ALTER TABLE public.opportunity_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage opportunity_stages" ON public.opportunity_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_opp_stages_upd BEFORE UPDATE ON public.opportunity_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.master_currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  symbol text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_currencies TO authenticated;
GRANT ALL ON public.master_currencies TO service_role;
ALTER TABLE public.master_currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage master_currencies" ON public.master_currencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_currencies_upd BEFORE UPDATE ON public.master_currencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.master_payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_payment_terms TO authenticated;
GRANT ALL ON public.master_payment_terms TO service_role;
ALTER TABLE public.master_payment_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage master_payment_terms" ON public.master_payment_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_pt_upd BEFORE UPDATE ON public.master_payment_terms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== CUSTOMERS ==========
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid,
  primary_contact_id uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_customers_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  reports_to_id uuid REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  last_contact_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ccontacts_customer ON public.customer_contacts(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;
GRANT ALL ON public.customer_contacts TO service_role;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage customer_contacts" ON public.customer_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_ccontacts_upd BEFORE UPDATE ON public.customer_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  stage text,
  probability int NOT NULL DEFAULT 0,
  close_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  owner_id uuid,
  currency text DEFAULT 'INR',
  payment_terms text,
  opportunity_source_id uuid,
  requirements_highlights text,
  budget_status text,
  authority_role text,
  need_level text,
  timeline text,
  primary_contact_id uuid,
  stage_changed_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_copp_customer ON public.customer_opportunities(customer_id);
CREATE INDEX idx_copp_stage ON public.customer_opportunities(stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_opportunities TO authenticated;
GRANT ALL ON public.customer_opportunities TO service_role;
ALTER TABLE public.customer_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage customer_opportunities" ON public.customer_opportunities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_copp_upd BEFORE UPDATE ON public.customer_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.opportunity_stage_change_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.stage,'') IS DISTINCT FROM COALESCE(OLD.stage,'') THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_opp_stage_change BEFORE UPDATE ON public.customer_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.opportunity_stage_change_trigger();

CREATE TABLE public.opportunity_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  name text NOT NULL,
  invoice_number text,
  invoice_date date,
  invoice_value numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_omilestones_opp ON public.opportunity_milestones(opportunity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_milestones TO authenticated;
GRANT ALL ON public.opportunity_milestones TO service_role;
ALTER TABLE public.opportunity_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage opportunity_milestones" ON public.opportunity_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_omilestones_upd BEFORE UPDATE ON public.opportunity_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.opportunity_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  total numeric NOT NULL DEFAULT 0,
  overall_discount_pct numeric NOT NULL DEFAULT 0,
  is_synced boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oquotes_opp ON public.opportunity_quotes(opportunity_id);
CREATE UNIQUE INDEX uniq_synced_quote_per_opp ON public.opportunity_quotes(opportunity_id) WHERE is_synced;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_quotes TO authenticated;
GRANT ALL ON public.opportunity_quotes TO service_role;
ALTER TABLE public.opportunity_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage opportunity_quotes" ON public.opportunity_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_oquotes_upd BEFORE UPDATE ON public.opportunity_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.opportunity_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.opportunity_quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.master_products(id),
  product_name text,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  term_months numeric,
  discount_pct numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oquote_items_quote ON public.opportunity_quote_items(quote_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_quote_items TO authenticated;
GRANT ALL ON public.opportunity_quote_items TO service_role;
ALTER TABLE public.opportunity_quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage opportunity_quote_items" ON public.opportunity_quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sync_opportunity_amount_from_quote()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_synced THEN
    UPDATE public.opportunity_quotes
      SET is_synced = false
      WHERE opportunity_id = NEW.opportunity_id
        AND id <> NEW.id AND is_synced;
    UPDATE public.customer_opportunities SET amount = NEW.total WHERE id = NEW.opportunity_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_opportunity_amount AFTER INSERT OR UPDATE OF is_synced, total ON public.opportunity_quotes
  FOR EACH ROW EXECUTE FUNCTION public.sync_opportunity_amount_from_quote();

-- ========== EVENTS ==========
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type_id uuid REFERENCES public.master_event_types(id) ON DELETE SET NULL,
  budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  actual_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  event_details text,
  expected_end_result text,
  owner_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_type ON public.events(event_type_id);
CREATE INDEX idx_events_customer ON public.events(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage events" ON public.events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_events_upd BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== LEADS ==========
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  name text NOT NULL,
  title text,
  company text,
  email text,
  phone text,
  website text,
  address text,
  industry text,
  lead_status_id uuid REFERENCES public.master_lead_statuses(id) ON DELETE SET NULL,
  lead_source_id uuid REFERENCES public.master_lead_sources(id) ON DELETE SET NULL,
  related_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  business_card_url text,
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  converted_at timestamptz,
  contact_role text,
  target_first_contact_date date,
  actual_first_contact_date date,
  target_conversion_date date,
  researched_information text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON public.leads(lead_status_id);
CREATE INDEX idx_leads_source ON public.leads(lead_source_id);
CREATE INDEX idx_leads_event ON public.leads(related_event_id);
CREATE INDEX idx_leads_customer ON public.leads(converted_customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_leads_upd BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'Note',
  subject text NOT NULL,
  notes text,
  activity_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cactivities_customer ON public.customer_activities(customer_id);
CREATE INDEX idx_cactivities_opp ON public.customer_activities(opportunity_id);
CREATE INDEX idx_cactivities_lead ON public.customer_activities(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_activities TO authenticated;
GRANT ALL ON public.customer_activities TO service_role;
ALTER TABLE public.customer_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage customer_activities" ON public.customer_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_cactivities_upd BEFORE UPDATE ON public.customer_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  file_type text,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cdocs_customer ON public.customer_documents(customer_id);
CREATE INDEX idx_cdocs_opp ON public.customer_documents(opportunity_id);
CREATE INDEX idx_cdocs_lead ON public.customer_documents(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage customer_documents" ON public.customer_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_cdocs_upd BEFORE UPDATE ON public.customer_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lead_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_audit_lead ON public.lead_audit_log(lead_id);
GRANT SELECT, INSERT ON public.lead_audit_log TO authenticated;
GRANT ALL ON public.lead_audit_log TO service_role;
ALTER TABLE public.lead_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read lead_audit_log" ON public.lead_audit_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.lead_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from text; v_to text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_audit_log (lead_id, actor_id, action, to_value)
    VALUES (NEW.id, auth.uid(), 'created', (SELECT name FROM public.master_lead_statuses WHERE id = NEW.lead_status_id));
  ELSIF TG_OP = 'UPDATE' AND COALESCE(NEW.lead_status_id::text,'') IS DISTINCT FROM COALESCE(OLD.lead_status_id::text,'') THEN
    SELECT name INTO v_from FROM public.master_lead_statuses WHERE id = OLD.lead_status_id;
    SELECT name INTO v_to FROM public.master_lead_statuses WHERE id = NEW.lead_status_id;
    INSERT INTO public.lead_audit_log (lead_id, actor_id, action, from_value, to_value)
    VALUES (NEW.id, auth.uid(), 'status_change', v_from, v_to);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_lead_audit_insert AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_audit_trigger();
CREATE TRIGGER trg_lead_audit_status AFTER UPDATE OF lead_status_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_audit_trigger();

CREATE OR REPLACE FUNCTION public.convert_lead(_lead_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_customer_id uuid;
  v_merge_id uuid;
  v_converted_status uuid;
  v_account_name text;
  v_account_owner uuid;
  v_industry text;
  v_opp_name text;
  v_opp_type text;
  v_opp_stage text;
  v_opp_probability integer;
  v_opp_amount numeric;
  v_opp_close_date date;
  v_contact_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF v_lead.converted_customer_id IS NOT NULL THEN RAISE EXCEPTION 'Lead already converted'; END IF;

  v_merge_id := NULLIF(_payload->>'merge_customer_id','')::uuid;
  v_account_name := COALESCE(_payload->>'account_name', v_lead.company, v_lead.name);
  v_account_owner := COALESCE(NULLIF(_payload->>'account_owner_id','')::uuid, auth.uid());
  v_industry := COALESCE(_payload->>'industry', v_lead.industry);
  v_opp_name := COALESCE(_payload->>'opportunity_name', v_account_name || ' - Opportunity');
  v_opp_type := _payload->>'opportunity_type';
  v_opp_stage := _payload->>'opportunity_stage';
  v_opp_probability := COALESCE((_payload->>'probability')::integer, 0);
  v_opp_amount := COALESCE((_payload->>'amount')::numeric, 0);
  v_opp_close_date := NULLIF(_payload->>'close_date','')::date;
  v_contact_name := COALESCE(_payload->>'contact_name', v_lead.name);

  IF v_merge_id IS NOT NULL THEN
    v_customer_id := v_merge_id;
  ELSE
    INSERT INTO public.customers (name, industry, status, owner_id)
    VALUES (v_account_name, v_industry, 'Active', v_account_owner)
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.customer_contacts (customer_id, name, title, email, phone)
  VALUES (v_customer_id, v_contact_name, v_lead.title, v_lead.email, v_lead.phone);

  INSERT INTO public.customer_opportunities (customer_id, name, type, stage, probability, amount, close_date, owner_id)
  VALUES (v_customer_id, v_opp_name, v_opp_type, v_opp_stage, v_opp_probability, v_opp_amount, v_opp_close_date, v_account_owner);

  UPDATE public.customer_activities SET customer_id = v_customer_id WHERE lead_id = _lead_id;
  UPDATE public.customer_documents SET customer_id = v_customer_id WHERE lead_id = _lead_id;

  IF v_lead.related_event_id IS NOT NULL THEN
    UPDATE public.events SET customer_id = v_customer_id WHERE id = v_lead.related_event_id AND customer_id IS NULL;
  END IF;

  SELECT id INTO v_converted_status FROM public.master_lead_statuses WHERE is_converted_status = true LIMIT 1;
  UPDATE public.leads
    SET converted_customer_id = v_customer_id,
        converted_at = now(),
        lead_status_id = COALESCE(v_converted_status, lead_status_id)
    WHERE id = _lead_id;

  INSERT INTO public.lead_audit_log (lead_id, actor_id, action, to_value)
  VALUES (_lead_id, auth.uid(), 'converted', v_account_name);

  RETURN v_customer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, jsonb) TO authenticated;

-- Storage RLS for customer-documents bucket
CREATE POLICY "cust_docs_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'customer-documents');
CREATE POLICY "cust_docs_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'customer-documents');
CREATE POLICY "cust_docs_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'customer-documents');
CREATE POLICY "cust_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'customer-documents');

-- Seed data
INSERT INTO public.master_event_types (name, sort_order) VALUES
  ('Trade Show', 1), ('Webinar', 2), ('Conference', 3), ('Site Visit', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.master_lead_statuses (name, color, sort_order, is_converted_status) VALUES
  ('New', 'blue', 1, false),
  ('Contacted', 'amber', 2, false),
  ('Qualified', 'green', 3, false),
  ('Unqualified', 'red', 4, false),
  ('Converted', 'purple', 5, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.master_lead_sources (name, sort_order) VALUES
  ('Event', 1), ('Referral', 2), ('Website', 3), ('Cold Call', 4), ('Campaign', 5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.opportunity_types (name, sort_order) VALUES
  ('Upsell', 1), ('Renewal', 2), ('New', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.opportunity_stages (name, color, sort_order, is_won, is_closed) VALUES
  ('Discovery', 'gray', 1, false, false),
  ('Proposal', 'blue', 2, false, false),
  ('Negotiation', 'amber', 3, false, false),
  ('Closed Won', 'green', 4, true, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.master_currencies (code, symbol, name, sort_order) VALUES
  ('INR','₹','Indian Rupee',1),
  ('USD','$','US Dollar',2),
  ('EUR','€','Euro',3),
  ('GBP','£','British Pound',4),
  ('AED','د.إ','UAE Dirham',5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.master_payment_terms (name, sort_order) VALUES
  ('Net 15',1),('Net 30',2),('Net 45',3),('Net 60',4),
  ('50% Advance',5),('Full Advance',6),('Milestone Based',7)
ON CONFLICT (name) DO NOTHING;
