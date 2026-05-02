-- Update Shorts DB for replies and views
ALTER TABLE public.short_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.short_comments(id) ON DELETE CASCADE;

-- Ensure short_views is unique per user per short
ALTER TABLE public.short_views DROP CONSTRAINT IF EXISTS short_views_short_id_user_id_key;
ALTER TABLE public.short_views ADD CONSTRAINT short_views_short_id_user_id_key UNIQUE (short_id, user_id);
