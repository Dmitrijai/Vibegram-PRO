CREATE TABLE IF NOT EXISTS public.mini_apps_likes (
    app_id UUID REFERENCES public.mini_apps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (app_id, user_id)
);

ALTER TABLE public.mini_apps_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can format likes" ON public.mini_apps_likes;
DROP POLICY IF EXISTS "Users can like" ON public.mini_apps_likes;
DROP POLICY IF EXISTS "Users can unlike" ON public.mini_apps_likes;

CREATE POLICY "Anyone can read likes" ON public.mini_apps_likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.mini_apps_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.mini_apps_likes FOR DELETE USING (auth.uid() = user_id);

-- Also add likes column to mini_apps table if you want a denormalized count, or just handle it as a view/computed. We will use a counter or just count on the fly. Actually, let's create a trigger or just look it up.
ALTER TABLE public.mini_apps ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Trigger to update likes_count
CREATE OR REPLACE FUNCTION public.update_mini_apps_likes_count()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.mini_apps SET likes_count = likes_count + 1 WHERE id = NEW.app_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.mini_apps SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.app_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_mini_apps_likes_count ON public.mini_apps_likes;
CREATE TRIGGER trg_update_mini_apps_likes_count
AFTER INSERT OR DELETE ON public.mini_apps_likes
FOR EACH ROW EXECUTE FUNCTION public.update_mini_apps_likes_count();
