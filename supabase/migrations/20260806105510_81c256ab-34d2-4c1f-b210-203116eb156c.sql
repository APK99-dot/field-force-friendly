CREATE TABLE public.procurement_list_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  filters jsonb NOT NULL DEFAULT '{"match":"all","conditions":[]}'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_field text,
  sort_dir text NOT NULL DEFAULT 'desc',
  visibility text NOT NULL DEFAULT 'private',
  shared_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_list_views TO authenticated;
GRANT ALL ON public.procurement_list_views TO service_role;

ALTER TABLE public.procurement_list_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View owned, shared or public list views"
ON public.procurement_list_views FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR visibility = 'everyone'
  OR auth.uid() = ANY(shared_user_ids)
);

CREATE POLICY "Create own list views"
ON public.procurement_list_views FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner or admin can update list views"
ON public.procurement_list_views FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner or admin can delete list views"
ON public.procurement_list_views FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER procurement_list_views_updated_at
BEFORE UPDATE ON public.procurement_list_views
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();