-- Make "override a vendor quote status / revert a stage" a grantable action.
--
-- Both controls in ProcurementDetail were gated on a hardcoded isAdmin check, so
-- the only way to let a site engineer correct a quote status was to make them an
-- admin outright — which also hands over user management, security settings and
-- the rest of the admin panel.
--
-- Registering the action puts it in the Security & Access matrix, where it can
-- be granted per profile. Admins keep the ability implicitly in code
-- (isAdmin || hasActionPermission), so nothing anyone can do today is removed.
--
-- module_procurement has to be registered first: the app has always gated the
-- Procurement nav and its approve permission on it, but it was never added to
-- permission_definitions, so it does not appear in the matrix and parent_module
-- references it by name. Adding the definition row changes nothing about who
-- has access — grants live in profile_object_permissions, which has no foreign
-- key to this table — it only makes Procurement visible and manageable in the
-- Security & Access UI, alongside the modules already listed there.
--
-- No profile is granted the action here, deliberately. This migration makes the
-- permission available; who receives it is an operator decision made in the UI.

INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order)
VALUES ('module_procurement', 'Procurement', 'module', NULL, 8)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order)
VALUES (
  'action_procurement_override_status',
  'Override Quote / Stage Status',
  'action',
  'module_procurement',
  1
)
ON CONFLICT (name) DO NOTHING;
