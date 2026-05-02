-- Выполните этот SQL в SQL Editor в Supabase

-- Shorts table
CREATE TABLE public.shorts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0
);

-- Short likes
CREATE TABLE public.short_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id UUID REFERENCES public.shorts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(short_id, user_id)
);

-- Short comments
CREATE TABLE public.short_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id UUID REFERENCES public.shorts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Short views (for analytics)
CREATE TABLE public.short_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id UUID REFERENCES public.shorts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Policies for public access to view shorts
ALTER TABLE public.shorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shorts are visible to everyone" ON public.shorts FOR SELECT USING (true);
CREATE POLICY "Users can insert their own shorts" ON public.shorts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Everyone can update shorts stats" ON public.shorts FOR UPDATE USING (true);
CREATE POLICY "Users can delete their own shorts" ON public.shorts FOR DELETE USING (auth.uid() = author_id);

ALTER TABLE public.short_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes visible to everyone" ON public.short_likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.short_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.short_likes FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.short_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments visible to everyone" ON public.short_comments FOR SELECT USING (true);
CREATE POLICY "Users can comment" ON public.short_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can delete own comments" ON public.short_comments FOR DELETE USING (auth.uid() = author_id);

ALTER TABLE public.short_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Views visible to everyone" ON public.short_views FOR SELECT USING (true);
CREATE POLICY "Users can add view" ON public.short_views FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Storage Bucket for shorts (if not exists)
insert into storage.buckets (id, name, public) values ('shorts', 'shorts', true);
create policy "Anyone can read shorts" on storage.objects for select using (bucket_id = 'shorts');
create policy "Authenticated users can upload shorts" on storage.objects for insert with check (bucket_id = 'shorts');
