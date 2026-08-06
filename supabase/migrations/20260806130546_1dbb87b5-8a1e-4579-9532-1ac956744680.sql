-- Helper predicate reused below: procurement-side business need.
-- (inline expressions are used so no new function/permissions are introduced)

-- 1. Staff directory --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view active users" ON public.users;
CREATE POLICY "Team viewers can view active users"
  ON public.users FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (
      id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.can_access_object(auth.uid(), 'module_my_team', 'read')
    )
  );

-- 2. Vendors ----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view vendors" ON public.vendors;
CREATE POLICY "Procurement users can view vendors"
  ON public.vendors FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
    OR public.can_access_object(auth.uid(), 'module_vendors', 'read')
    OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read')
  );

-- 3. Procurement financial records -----------------------------------------
DROP POLICY IF EXISTS "Authenticated can read invoices" ON public.procurement_invoices;
CREATE POLICY "Procurement users can read invoices"
  ON public.procurement_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read'));

DROP POLICY IF EXISTS "Authenticated can read invoice items" ON public.procurement_invoice_items;
CREATE POLICY "Procurement users can read invoice items"
  ON public.procurement_invoice_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read'));

DROP POLICY IF EXISTS "Authenticated can read invoice payments" ON public.procurement_invoice_payments;
CREATE POLICY "Procurement users can read invoice payments"
  ON public.procurement_invoice_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read'));

DROP POLICY IF EXISTS "Authenticated can read invoice attachments" ON public.procurement_invoice_attachments;
CREATE POLICY "Procurement users can read invoice attachments"
  ON public.procurement_invoice_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read'));

-- 4. Vendor quotes ----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view vendor quotes" ON public.procurement_vendor_quotes;
DROP POLICY IF EXISTS "Authenticated can insert vendor quotes" ON public.procurement_vendor_quotes;
DROP POLICY IF EXISTS "Authenticated can update vendor quotes" ON public.procurement_vendor_quotes;
DROP POLICY IF EXISTS "Authenticated can delete vendor quotes" ON public.procurement_vendor_quotes;

CREATE POLICY "Procurement users can view vendor quotes"
  ON public.procurement_vendor_quotes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));

CREATE POLICY "Procurement users can write vendor quotes"
  ON public.procurement_vendor_quotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can view vendor quote items" ON public.procurement_vendor_quote_items;
DROP POLICY IF EXISTS "Authenticated can insert vendor quote items" ON public.procurement_vendor_quote_items;
DROP POLICY IF EXISTS "Authenticated can update vendor quote items" ON public.procurement_vendor_quote_items;
DROP POLICY IF EXISTS "Authenticated can delete vendor quote items" ON public.procurement_vendor_quote_items;

CREATE POLICY "Procurement users can view vendor quote items"
  ON public.procurement_vendor_quote_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));

CREATE POLICY "Procurement users can write vendor quote items"
  ON public.procurement_vendor_quote_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

-- 5. Vendor feedback --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view vendor feedback" ON public.procurement_vendor_feedback;
DROP POLICY IF EXISTS "Authenticated can insert vendor feedback" ON public.procurement_vendor_feedback;
DROP POLICY IF EXISTS "Authenticated can update vendor feedback" ON public.procurement_vendor_feedback;
DROP POLICY IF EXISTS "Authenticated can delete vendor feedback" ON public.procurement_vendor_feedback;

CREATE POLICY "Procurement users can view vendor feedback"
  ON public.procurement_vendor_feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));

CREATE POLICY "Procurement users can write vendor feedback"
  ON public.procurement_vendor_feedback FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'edit'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'edit'));

-- 6. CRM records ------------------------------------------------------------
DROP POLICY IF EXISTS "auth manage customers" ON public.customers;
CREATE POLICY "CRM users manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'read'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'edit'));

DROP POLICY IF EXISTS "auth manage leads" ON public.leads;
CREATE POLICY "CRM users manage leads" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_leads', 'read'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_leads', 'edit'));

DROP POLICY IF EXISTS "auth manage customer_contacts" ON public.customer_contacts;
CREATE POLICY "CRM users manage customer contacts" ON public.customer_contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'read'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'edit'));

DROP POLICY IF EXISTS "auth manage customer_activities" ON public.customer_activities;
CREATE POLICY "CRM users manage customer activities" ON public.customer_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'read'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'edit'));

DROP POLICY IF EXISTS "auth manage customer_documents" ON public.customer_documents;
CREATE POLICY "CRM users manage customer documents" ON public.customer_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'read'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_customers', 'edit'));