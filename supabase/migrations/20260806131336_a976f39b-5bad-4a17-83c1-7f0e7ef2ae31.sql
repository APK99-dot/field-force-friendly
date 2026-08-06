-- 1. Vendor quote portal uploads must land in a valid, open quote folder --------
CREATE OR REPLACE FUNCTION public.vendor_quote_token_open(_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.procurement_vendor_quotes q
    WHERE q.token = _token AND q.is_latest AND q.submitted_at IS NULL
  )
$$;
REVOKE ALL ON FUNCTION public.vendor_quote_token_open(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_quote_token_open(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Vendor portal can upload quote attachments" ON storage.objects;
CREATE POLICY "Vendor portal can upload to its own quote folder"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'vendor-quote-attachments'
    AND public.vendor_quote_token_open((storage.foldername(name))[1])
  );

-- 2. Purchase order creation must be self-owned ---------------------------------
DROP POLICY IF EXISTS "Users create procurement" ON public.procurement_orders;
CREATE POLICY "Users create own procurement orders"
  ON public.procurement_orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
              OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. CRM opportunity / event tables ---------------------------------------------
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_opportunities','opportunity_quotes','opportunity_quote_items',
    'opportunity_milestones','events'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format($f$
      CREATE POLICY "CRM users manage %1$s" ON public.%1$I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.can_access_object(auth.uid(), 'module_customers', 'read')
             OR public.can_access_object(auth.uid(), 'module_opportunities', 'read'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.can_access_object(auth.uid(), 'module_customers', 'edit')
             OR public.can_access_object(auth.uid(), 'module_opportunities', 'edit'))
    $f$, t);
  END LOOP;
END $$;

-- 4. Project management tables ---------------------------------------------------
DO $$
DECLARE t text; p record; has_project boolean; has_created boolean; expr text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
            WHERE schemaname='public' AND tablename LIKE 'pm\_%' LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=t AND column_name='project_id')
      INTO has_project;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=t AND column_name='created_by')
      INTO has_created;

    expr := 'public.has_role(auth.uid(), ''admin''::app_role)';
    IF has_created THEN
      expr := expr || ' OR created_by = auth.uid()';
    END IF;
    IF has_project THEN
      expr := expr || ' OR EXISTS (SELECT 1 FROM public.pm_project_members m'
                   || ' WHERE m.project_id = ' || quote_ident(t) || '.project_id'
                   || ' AND m.user_id = auth.uid())';
    END IF;
    IF t = 'pm_projects' THEN
      expr := expr || ' OR EXISTS (SELECT 1 FROM public.pm_project_members m'
                   || ' WHERE m.project_id = pm_projects.id AND m.user_id = auth.uid())';
    END IF;

    FOR p IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Project members manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)',
      t, expr);
  END LOOP;
END $$;