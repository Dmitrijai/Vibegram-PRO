-- Ок, нам нужно обновить политики RLS для shorts и mini_apps
-- чтобы разрешить администраторах удалять и редактировать чужие записи

-- 1. Обновляем для shorts
DROP POLICY IF EXISTS "Shorts delete" ON public.shorts;
CREATE POLICY "Shorts delete" ON public.shorts FOR DELETE USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Shorts update" ON public.shorts;
CREATE POLICY "Shorts update" ON public.shorts FOR UPDATE USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

-- 2. Обновляем для storage (shorts)
DROP POLICY IF EXISTS "Users can delete their shorts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their shorts media" ON storage.objects;
CREATE POLICY "Users can delete their shorts" ON storage.objects FOR DELETE USING (bucket_id = 'shorts' AND (auth.uid() = owner OR public.is_admin(auth.uid())));

-- 3. Обновляем для mini_apps
DROP POLICY IF EXISTS "Users can update their own apps" ON public.mini_apps;
CREATE POLICY "Users can update apps" ON public.mini_apps FOR UPDATE USING (creator_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own apps" ON public.mini_apps;
CREATE POLICY "Users can delete apps" ON public.mini_apps FOR DELETE USING (creator_id = auth.uid() OR public.is_admin(auth.uid()));
