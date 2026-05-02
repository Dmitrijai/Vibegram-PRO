CREATE TABLE IF NOT EXISTS public.mini_apps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    html_content TEXT NOT NULL,
    visibility TEXT DEFAULT 'unlisted' CHECK (visibility IN ('public', 'unlisted')),
    icon_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    views_count INTEGER DEFAULT 0
);

ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read any mini_app" ON public.mini_apps;
DROP POLICY IF EXISTS "Auth users can insert" ON public.mini_apps;
DROP POLICY IF EXISTS "Users can update their own apps" ON public.mini_apps;
DROP POLICY IF EXISTS "Users can delete their own apps" ON public.mini_apps;

CREATE POLICY "Anyone can read any mini_app" ON public.mini_apps FOR SELECT USING (true);
CREATE POLICY "Auth users can insert" ON public.mini_apps FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update their own apps" ON public.mini_apps FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete their own apps" ON public.mini_apps FOR DELETE USING (auth.uid() = creator_id);
