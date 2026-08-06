-- Procurement reads -----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read procurement" ON public.procurement_orders;
CREATE POLICY "Procurement users can read procurement orders"
  ON public.procurement_orders FOR SELECT TO authenticated
  USING (created_by = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));

DROP POLICY IF EXISTS "Authenticated can read grns" ON public.procurement_grns;
CREATE POLICY "Procurement users can read grns"
  ON public.procurement_grns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));

DROP POLICY IF EXISTS "Authenticated can read grn items" ON public.procurement_grn_items;
CREATE POLICY "Procurement users can read grn items"
  ON public.procurement_grn_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));

DROP POLICY IF EXISTS "Authenticated read procurement attachments" ON public.procurement_attachments;
DROP POLICY IF EXISTS "Authenticated write procurement attachments" ON public.procurement_attachments;
CREATE POLICY "Procurement users read procurement attachments"
  ON public.procurement_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'read'));
CREATE POLICY "Procurement users write procurement attachments"
  ON public.procurement_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'edit'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
         OR public.can_access_object(auth.uid(), 'module_goods_receipt', 'edit'));

-- Workforce data ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view today's attendance" ON public.attendance;
CREATE POLICY "Self and managers view today's attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (date = CURRENT_DATE AND (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id IN (SELECT sub.user_id FROM public.get_user_hierarchy(auth.uid()) sub(user_id, level))
    OR user_id IN (SELECT sub.user_id FROM public.get_subordinate_users(auth.uid()) sub(user_id, level))
  ));

DROP POLICY IF EXISTS "Authenticated can view approved leaves covering today" ON public.leave_applications;
CREATE POLICY "Self and managers view approved leaves today"
  ON public.leave_applications FOR SELECT TO authenticated
  USING (status = 'approved' AND from_date <= CURRENT_DATE AND to_date >= CURRENT_DATE AND (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id IN (SELECT sub.user_id FROM public.get_user_hierarchy(auth.uid()) sub(user_id, level))
    OR user_id IN (SELECT sub.user_id FROM public.get_subordinate_users(auth.uid()) sub(user_id, level))
  ));

-- Lead audit trail ---------------------------------------------------------------
DROP POLICY IF EXISTS "auth read lead_audit_log" ON public.lead_audit_log;
CREATE POLICY "CRM users read lead audit log"
  ON public.lead_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.can_access_object(auth.uid(), 'module_leads', 'read'));