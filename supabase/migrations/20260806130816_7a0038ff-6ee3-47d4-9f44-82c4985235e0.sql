-- Procurement-side buckets ---------------------------------------------------
DROP POLICY IF EXISTS "auth read procurement-attachments" ON storage.objects;
DROP POLICY IF EXISTS "auth write procurement-attachments" ON storage.objects;
DROP POLICY IF EXISTS "auth update procurement-attachments" ON storage.objects;
DROP POLICY IF EXISTS "auth delete procurement-attachments" ON storage.objects;
CREATE POLICY "Procurement staff manage procurement attachments"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'procurement-attachments' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
    OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read')))
  WITH CHECK (bucket_id = 'procurement-attachments' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
    OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'edit')));

DROP POLICY IF EXISTS "Authenticated read invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete invoice files" ON storage.objects;
CREATE POLICY "Procurement staff manage invoice files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoice-attachments' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_procurement', 'read')))
  WITH CHECK (bucket_id = 'invoice-attachments' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')));

DROP POLICY IF EXISTS "Authenticated can read grn photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload grn photos" ON storage.objects;
CREATE POLICY "Goods receipt staff read grn photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'grn-photos' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read')
    OR public.can_access_object(auth.uid(), 'module_procurement', 'read')));
CREATE POLICY "Goods receipt staff upload grn photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'grn-photos' AND owner = auth.uid() AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'edit')
    OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')));

-- Site attachments ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read site attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload site attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update site attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete site attachments" ON storage.objects;
CREATE POLICY "Site staff manage site attachments"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'site-attachments' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_projects_sites', 'read')))
  WITH CHECK (bucket_id = 'site-attachments' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_projects_sites', 'edit')));

-- Customer documents ----------------------------------------------------------
DROP POLICY IF EXISTS "cust_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "cust_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "cust_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "cust_docs_delete" ON storage.objects;
CREATE POLICY "CRM staff manage customer documents"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'customer-documents' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_customers', 'read')))
  WITH CHECK (bucket_id = 'customer-documents' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_object(auth.uid(), 'module_customers', 'edit')));

-- Activity voice notes ---------------------------------------------------------
DROP POLICY IF EXISTS "Public read activity audio" ON storage.objects;
CREATE POLICY "Signed-in staff read activity audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'activity-audio');

-- Master addresses and procurement item pricing --------------------------------
DROP POLICY IF EXISTS "Authenticated can view addresses" ON public.master_addresses;
CREATE POLICY "Business users can view addresses"
  ON public.master_addresses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_master_data', 'read')
         OR public.can_access_object(auth.uid(), 'module_projects_sites', 'read'));

DROP POLICY IF EXISTS "Authenticated can read procurement items" ON public.procurement_items;
CREATE POLICY "Procurement users can read procurement items"
  ON public.procurement_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));