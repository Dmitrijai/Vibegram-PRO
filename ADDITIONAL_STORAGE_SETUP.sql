-- ДОПОЛНИТЕЛЬНЫЙ ФАЙЛ ДЛЯ НАСТРОЙКИ STORAGE (ХРАНИЛИЩА)
-- Выполните этот скрипт в SQL Editor, чтобы создать все необходимые бакеты (папки) для медиафайлов и выставить им правильные доступы.

-- 1. Создание бакетов (если они еще не существуют)
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_media', 'vibegram_media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_voice_video', 'vibegram_voice_video', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_avatars', 'vibegram_avatars', true) ON CONFLICT (id) DO NOTHING;
-- Бакет shorts уже должен быть создан с помощью COMPLETE_MIGRATION.sql, но добавим на всякий случай
INSERT INTO storage.buckets (id, name, public) VALUES ('shorts', 'shorts', true) ON CONFLICT (id) DO NOTHING;

-- 2. Сброс старых политик (на случай, если они как-то были созданы с ошибками)
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

-- 3. Установка политик для vibegram_media (отправка картинок, файлов)
CREATE POLICY "Anyone can read vibegram_media" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_media');
CREATE POLICY "Authenticated users can upload vibegram_media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_media');
CREATE POLICY "Users can delete their vibegram_media" ON storage.objects FOR DELETE USING (bucket_id = 'vibegram_media' AND auth.uid() = owner);

-- 4. Установка политик для vibegram_voice_video (голосовые, кружочки)
CREATE POLICY "Anyone can read vibegram_voice_video" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_voice_video');
CREATE POLICY "Authenticated users can upload vibegram_voice_video" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_voice_video');
CREATE POLICY "Users can delete their vibegram_voice_video" ON storage.objects FOR DELETE USING (bucket_id = 'vibegram_voice_video' AND auth.uid() = owner);

-- 5. Установка политик для vibegram_avatars (аватарки пользователей и групп)
CREATE POLICY "Anyone can read vibegram_avatars" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_avatars');
CREATE POLICY "Authenticated users can upload vibegram_avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_avatars');
CREATE POLICY "Users can delete their vibegram_avatars" ON storage.objects FOR DELETE USING (bucket_id = 'vibegram_avatars' AND auth.uid() = owner);
CREATE POLICY "Users can update their avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'vibegram_avatars' AND auth.uid() = owner);
