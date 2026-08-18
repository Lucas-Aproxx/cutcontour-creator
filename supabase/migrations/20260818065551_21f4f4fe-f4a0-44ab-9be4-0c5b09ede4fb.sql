CREATE TABLE public.crm_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_fields TO authenticated;
GRANT ALL ON public.crm_fields TO service_role;

ALTER TABLE public.crm_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own crm fields" ON public.crm_fields
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_crm_fields_updated_at BEFORE UPDATE ON public.crm_fields
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contacts ADD COLUMN custom jsonb NOT NULL DEFAULT '{}'::jsonb;