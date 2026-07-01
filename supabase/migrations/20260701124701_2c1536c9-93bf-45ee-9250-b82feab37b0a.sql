-- Configuration & Approval Workflow store
CREATE TABLE public.app_configuration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (module, config_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_configuration TO authenticated;
GRANT ALL ON public.app_configuration TO service_role;

ALTER TABLE public.app_configuration ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read config so feature modules can honour settings
CREATE POLICY "Authenticated can read configuration"
ON public.app_configuration FOR SELECT
TO authenticated
USING (true);

-- Only admins can change configuration
CREATE POLICY "Admins can insert configuration"
ON public.app_configuration FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update configuration"
ON public.app_configuration FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete configuration"
ON public.app_configuration FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_app_configuration_updated_at
BEFORE UPDATE ON public.app_configuration
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();