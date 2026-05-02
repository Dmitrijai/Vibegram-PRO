ALTER TABLE public.mini_apps ADD COLUMN IF NOT EXISTS html_url TEXT;
ALTER TABLE public.mini_apps ALTER COLUMN html_content DROP NOT NULL;
