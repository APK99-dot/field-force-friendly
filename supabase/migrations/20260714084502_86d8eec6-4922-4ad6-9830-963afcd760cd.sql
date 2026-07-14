
ALTER TABLE public.site_milestones
  ADD COLUMN IF NOT EXISTS at_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.site_milestones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_site_milestones_parent ON public.site_milestones(parent_id);

CREATE TABLE IF NOT EXISTS public.site_milestone_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.site_milestones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_milestone_comments TO authenticated;
GRANT ALL ON public.site_milestone_comments TO service_role;

ALTER TABLE public.site_milestone_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view milestone comments"
  ON public.site_milestone_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own milestone comments"
  ON public.site_milestone_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own milestone comments"
  ON public.site_milestone_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users or admins can delete milestone comments"
  ON public.site_milestone_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_smc_milestone ON public.site_milestone_comments(milestone_id, created_at DESC);

CREATE TRIGGER update_site_milestone_comments_updated_at
  BEFORE UPDATE ON public.site_milestone_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
