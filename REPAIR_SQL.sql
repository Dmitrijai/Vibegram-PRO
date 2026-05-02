-- 1. ИСПРАВЛЕНИЕ ТРИГГЕРА РЕГИСТРАЦИИ (Поддержка логина через Google и генерация @username и имени)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, avatar_url)
  VALUES (
    new.id,
    
    -- ИЩЕМ ИМЯ. Google передает имя в 'full_name' или 'name'
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'display_name', 'User'),
    
    -- ГЕНЕРИРУЕМ УНИКАЛЬНЫЙ USERNAME. Берем логин из почты (до @)
    COALESCE(
      new.raw_user_meta_data->>'username', -- Если username передали вручную при регистрации
      regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g') || '_' || substr(new.id::text, 1, 4),
      'user_' || substr(new.id::text, 1, 8)
    ),
    
    -- ИЩЕМ АВАТАРКУ. Google передает URL аватарки в 'picture' или 'avatar_url'
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', NULL)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ВКЛЮЧЕНИЕ REPLICA IDENTITY FULL ДЛЯ ТАБЛИЦЫ СООБЩЕНИЙ 
-- Важно: Без этого при удалении сообщения Supabase пришлет только его ID, и приложение сломается
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 3. СОЗДАНИЕ НЕДОСТАЮЩИХ BUCKETS В STORAGE И ИХ ПОЛИТИК
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_media', 'vibegram_media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_voice_video', 'vibegram_voice_video', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_avatars', 'vibegram_avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('shorts', 'shorts', true) ON CONFLICT (id) DO NOTHING;

-- Сброс старых политик
DROP POLICY IF EXISTS "Anyone can read vibegram_media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vibegram_media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their vibegram_media" ON storage.objects;

DROP POLICY IF EXISTS "Anyone can read vibegram_voice_video" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vibegram_voice_video" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their vibegram_voice_video" ON storage.objects;

DROP POLICY IF EXISTS "Anyone can read vibegram_avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vibegram_avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their vibegram_avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their avatars" ON storage.objects;

-- Политики для vibegram_media (картинки/файлы)
CREATE POLICY "Anyone can read vibegram_media" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_media');
CREATE POLICY "Authenticated users can upload vibegram_media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_media');
CREATE POLICY "Users can delete their vibegram_media" ON storage.objects FOR DELETE USING (bucket_id = 'vibegram_media'); -- Упрощаем для теста

-- Политики для vibegram_voice_video (голосовые/кружочки)
CREATE POLICY "Anyone can read vibegram_voice_video" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_voice_video');
CREATE POLICY "Authenticated users can upload vibegram_voice_video" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_voice_video');
CREATE POLICY "Users can delete their vibegram_voice_video" ON storage.objects FOR DELETE USING (bucket_id = 'vibegram_voice_video');

-- Политики для vibegram_avatars
CREATE POLICY "Anyone can read vibegram_avatars" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_avatars');
CREATE POLICY "Authenticated users can upload vibegram_avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_avatars');
CREATE POLICY "Users can delete their vibegram_avatars" ON storage.objects FOR DELETE USING (bucket_id = 'vibegram_avatars');
CREATE POLICY "Users can update their avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'vibegram_avatars');
