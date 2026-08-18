CREATE TABLE public.crm_layout (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_layout TO authenticated;
GRANT ALL ON public.crm_layout TO service_role;
ALTER TABLE public.crm_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own crm layout" ON public.crm_layout FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_crm_layout_updated_at BEFORE UPDATE ON public.crm_layout FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();