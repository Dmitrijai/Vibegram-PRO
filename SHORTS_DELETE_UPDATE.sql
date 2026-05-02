-- SQL для исправления удаления Shorts (выполните в SQL Editor в Supabase)

-- Политика для удаления из таблицы shorts
CREATE POLICY "Users can delete their own shorts" ON public.shorts FOR DELETE USING (auth.uid() = author_id);

-- Политика для удаления видео из хранилища (если ее нет)
CREATE POLICY "Users can delete their shorts" ON storage.objects FOR DELETE USING (bucket_id = 'shorts' AND auth.uid() = owner);

-- Возвращаем политику на апдейт (чтобы все могли лайкать и добавлять просмотры)
-- Если вы ее удалили, верните:
-- CREATE POLICY "Everyone can update shorts stats" ON public.shorts FOR UPDATE USING (true);
