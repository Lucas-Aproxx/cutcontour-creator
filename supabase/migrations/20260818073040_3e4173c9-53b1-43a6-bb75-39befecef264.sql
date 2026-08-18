CREATE TABLE public.crm_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Map',
  color text NOT NULL DEFAULT 'sky',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_folders TO authenticated;
GRANT ALL ON public.crm_folders TO service_role;

ALTER TABLE public.crm_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own crm folders" ON public.crm_folders
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_crm_folders_updated_at BEFORE UPDATE ON public.crm_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contacts
  ADD COLUMN folder_id uuid REFERENCES public.crm_folders(id) ON DELETE SET NULL;

CREATE INDEX contacts_folder_id_idx ON public.contacts(folder_id);