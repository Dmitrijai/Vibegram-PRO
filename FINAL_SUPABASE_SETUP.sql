-- КОМПЛЕКСНЫЙ И ФИНАЛЬНЫЙ СКРИПТ БАЗЫ ДАННЫХ VIBEGRAM
-- Этот скрипт включает все таблицы, исправляет триггеры, политики (включая баг с бесконечной рекурсией) 
-- и добавляет недостающие функции. Выполните его в SQL Editor.

-- ==============================================================================
-- 1. СОЗДАНИЕ ТАБЛИЦ
-- ==============================================================================

-- 1.1. Профили
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE cascade NOT NULL PRIMARY KEY,
  username text UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  status text,
  is_online boolean DEFAULT false,
  last_seen timestamp with time zone DEFAULT timezone('utc'::text, now()),
  settings jsonb DEFAULT '{}'::jsonb,
  vib_balance bigint DEFAULT 0,
  is_premium boolean DEFAULT false,
  premium_until timestamp with time zone,
  last_login timestamp with time zone,
  consecutive_days int DEFAULT 0,
  time_spent_today interval DEFAULT '0 seconds'::interval
);

-- 1.2. Чаты
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type in ('direct', 'private', 'group', 'channel')),
  title text,
  description text,
  avatar_url text,
  invite_key text UNIQUE,
  username text UNIQUE,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 1.3. Участники чатов
CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id uuid REFERENCES public.chats ON DELETE cascade NOT NULL,
  user_id uuid REFERENCES public.profiles ON DELETE cascade NOT NULL,
  role text DEFAULT 'member' CHECK (role in ('creator', 'admin', 'member', 'pending')),
  joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (chat_id, user_id)
);

-- 1.4. Сообщения
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid REFERENCES public.chats ON DELETE cascade NOT NULL,
  sender_id uuid REFERENCES public.profiles ON DELETE set null,
  content text,
  media jsonb DEFAULT '[]'::jsonb,
  -- ДОБАВЛЕНЫ НЕДОСТАЮЩИЕ ТИПЫ (photo, video, document):
  message_type text DEFAULT 'text' CHECK (message_type in ('text', 'voice', 'video_circle', 'poll', 'photo', 'video', 'document')),
  parent_id uuid REFERENCES public.messages ON DELETE set null,
  is_read boolean DEFAULT false,
  reactions jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 1.5. Shorts (Видео)
CREATE TABLE IF NOT EXISTS public.shorts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  video_url text NOT NULL,
  title text DEFAULT 'Без названия',
  description text,
  views_count bigint DEFAULT 0,
  likes_count bigint DEFAULT 0,
  comments_count bigint DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.short_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id uuid REFERENCES public.shorts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(short_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.short_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id uuid REFERENCES public.shorts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(short_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.short_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id uuid REFERENCES public.shorts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES public.short_comments(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 1.9. Переводы VIB
CREATE TABLE IF NOT EXISTS public.vib_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- ИСПРАВЛЕНИЕ ЗАВИСИМОСТЕЙ: добавлено ON DELETE CASCADE
  sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount bigint NOT NULL,
  message text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 1.10. Настройки администратора
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.admin_settings (key, value) VALUES ('weekly_vib_bonus', '15'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.admin_settings (key, value) VALUES ('premium_30d_price', '50'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.admin_settings (key, value) VALUES ('premium_365d_price', '300'::jsonb) ON CONFLICT (key) DO NOTHING;

-- 1.11. Мини-приложения (Mini Apps)
CREATE TABLE IF NOT EXISTS public.mini_apps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  html_content text,
  html_url text,
  visibility text DEFAULT 'unlisted' CHECK (visibility in ('public', 'unlisted')),
  icon_url text,
  views_count integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.mini_apps_likes (
  app_id uuid REFERENCES public.mini_apps(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (app_id, user_id)
);


-- ==============================================================================
-- 2. ФУНКЦИИ И ТРИГГЕРЫ
-- ==============================================================================

-- 2.1. Автосоздание профиля при регистрации (ИСПРАВЛЕННОЕ)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'display_name', 'User'),
    COALESCE(
      new.raw_user_meta_data->>'username',
      regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g') || '_' || substr(new.id::text, 1, 4),
      'user_' || substr(new.id::text, 1, 8)
    ),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', NULL)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2.2. ПРАВИЛЬНЫЕ ПРОВЕРКИ ДЛЯ RLS (ЧТОБЫ НЕ БЫЛО БЕСКОНЕЧНОЙ РЕКУРСИИ)
CREATE OR REPLACE FUNCTION public.is_admin(user_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((settings->>'is_tech_support')::boolean, false) OR COALESCE((settings->>'isAdmin')::boolean, false)
  FROM public.profiles
  WHERE id = user_uid;
$$;

CREATE OR REPLACE FUNCTION public.is_chat_member(chat_id_arg uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_id = chat_id_arg AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_chat(chat_id_arg uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = chat_id_arg AND is_public = true
  );
$$;

-- 2.3. Защита настроек профиля (от накрутки прав)
CREATE OR REPLACE FUNCTION public.protect_secure_settings()
RETURNS trigger AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    IF OLD.settings ? 'is_tech_support' THEN
      NEW.settings = jsonb_set(NEW.settings, '{is_tech_support}', OLD.settings->'is_tech_support');
    ELSE
      NEW.settings = NEW.settings - 'is_tech_support';
    END IF;

    IF OLD.settings ? 'isAdmin' THEN
      NEW.settings = jsonb_set(NEW.settings, '{isAdmin}', OLD.settings->'isAdmin');
    ELSE
      NEW.settings = NEW.settings - 'isAdmin';
    END IF;

    IF OLD.settings ? 'root_passphrase' THEN
      NEW.settings = jsonb_set(NEW.settings, '{root_passphrase}', OLD.settings->'root_passphrase');
    ELSE
      NEW.settings = NEW.settings - 'root_passphrase';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_admin_role ON public.profiles;
CREATE TRIGGER protect_admin_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_secure_settings();

-- 2.4. Перевод VIB
CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id uuid, amount bigint, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_balance bigint;
BEGIN
  IF amount <= 0 THEN RAISE EXCEPTION 'Minimum amount is 1 VIB.'; END IF;
  IF amount > 10000 THEN RAISE EXCEPTION 'Max 10000 VIB per transfer'; END IF;
  IF auth.uid() = receiver_id THEN RAISE EXCEPTION 'Cannot transfer to yourself'; END IF;

  SELECT COALESCE(vib_balance, 0) INTO sender_balance FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF sender_balance < amount THEN RAISE EXCEPTION 'Insufficient VIB balance'; END IF;

  UPDATE public.profiles SET vib_balance = vib_balance - amount WHERE id = auth.uid();
  UPDATE public.profiles SET vib_balance = COALESCE(vib_balance, 0) + amount WHERE id = receiver_id;

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), receiver_id, amount, note);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id uuid, amount integer, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.transfer_vib(receiver_id, amount::bigint, note);
END;
$$;

-- 2.5. Ежедневный бонус VIB
CREATE OR REPLACE FUNCTION public.system_grant_vib(amount bigint, note text DEFAULT 'Ежедневный бонус')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF amount <= 0 OR amount > 100 THEN
    RAISE EXCEPTION 'Invalid amount for system grant.';
  END IF;

  UPDATE public.profiles SET vib_balance = COALESCE(vib_balance, 0) + amount WHERE id = auth.uid();
  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message) VALUES (auth.uid(), auth.uid(), amount, note);
END;
$$;

CREATE OR REPLACE FUNCTION public.system_grant_vib(amount integer, note text DEFAULT 'Ежедневный бонус')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.system_grant_vib(amount::bigint, note);
END;
$$;

-- 2.6. Выдача / Отбор VIB
CREATE OR REPLACE FUNCTION public.admin_grant_vib(target_user_id uuid, amount bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT COALESCE((SELECT (settings->>'isAdmin')::boolean FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied. You are not a Creator.';
  END IF;
  IF amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero.'; END IF;

  UPDATE public.profiles SET vib_balance = COALESCE(vib_balance, 0) + amount WHERE id = target_user_id;
  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message) VALUES (auth.uid(), target_user_id, amount, 'Выдача Создателем');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_zero_vib(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT COALESCE((SELECT (settings->>'isAdmin')::boolean FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied. You are not a Creator.';
  END IF;

  UPDATE public.profiles SET vib_balance = 0 WHERE id = target_user_id;
  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message) VALUES (auth.uid(), target_user_id, 0, 'Баланс аннулирован Создателем');
END;
$$;

-- 2.7. Подписки
CREATE OR REPLACE FUNCTION public.buy_premium(cost bigint, duration_days int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_balance bigint;
  current_premium_until timestamp with time zone;
BEGIN
  IF cost <= 0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;
  SELECT COALESCE(vib_balance, 0), premium_until INTO current_balance, current_premium_until FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF current_balance < cost THEN RAISE EXCEPTION 'Insufficient VIB balance'; END IF;

  UPDATE public.profiles SET vib_balance = vib_balance - cost WHERE id = auth.uid();
  IF current_premium_until > now() THEN
    UPDATE public.profiles SET is_premium = true, premium_until = current_premium_until + make_interval(days => duration_days) WHERE id = auth.uid();
  ELSE
    UPDATE public.profiles SET is_premium = true, premium_until = now() + make_interval(days => duration_days) WHERE id = auth.uid();
  END IF;
END;
$$;

-- 2.8. ИСПРАВЛЕНИЕ: ДОБАВЛЕНА НЕДОСТАЮЩАЯ ФУНКЦИЯ ДЛЯ УВЕЛИЧЕНИЯ ПРОСМОТРОВ MINI APPS!
CREATE OR REPLACE FUNCTION public.increment_miniapp_view(app_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.mini_apps SET views_count = COALESCE(views_count, 0) + 1 WHERE id = app_id;
END;
$$;

-- 2.9 Триггер для лайков мини-приложений
CREATE OR REPLACE FUNCTION public.update_mini_apps_likes_count()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.mini_apps SET likes_count = likes_count + 1 WHERE id = NEW.app_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.mini_apps SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.app_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_mini_apps_likes_count ON public.mini_apps_likes;
CREATE TRIGGER trg_update_mini_apps_likes_count
AFTER INSERT OR DELETE ON public.mini_apps_likes
FOR EACH ROW EXECUTE PROCEDURE public.update_mini_apps_likes_count();


-- ==============================================================================
-- 3. ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS) БЕЗ БЕСКОНЕЧНОЙ РЕКУРСИИ
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vib_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_apps_likes ENABLE ROW LEVEL SECURITY;

-- Удаляем старые, чтобы не было конфликтов
DROP POLICY IF EXISTS "Profiles select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete" ON public.profiles;
DROP POLICY IF EXISTS "Chats select" ON public.chats;
DROP POLICY IF EXISTS "Chats insert" ON public.chats;
DROP POLICY IF EXISTS "Chats update" ON public.chats;
DROP POLICY IF EXISTS "Chats delete" ON public.chats;
DROP POLICY IF EXISTS "Chat members select" ON public.chat_members;
DROP POLICY IF EXISTS "Chat members insert" ON public.chat_members;
DROP POLICY IF EXISTS "Chat members update" ON public.chat_members;
DROP POLICY IF EXISTS "Chat members delete" ON public.chat_members;
DROP POLICY IF EXISTS "Messages select" ON public.messages;
DROP POLICY IF EXISTS "Messages insert" ON public.messages;
DROP POLICY IF EXISTS "Messages update" ON public.messages;
DROP POLICY IF EXISTS "Messages delete" ON public.messages;

-- PROFILES
CREATE POLICY "Profiles select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles update" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- CHATS
CREATE POLICY "Chats select" ON public.chats FOR SELECT USING (is_public = true OR public.is_admin(auth.uid()) OR public.is_chat_member(id));
CREATE POLICY "Chats insert" ON public.chats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Chats update" ON public.chats FOR UPDATE USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.chat_members WHERE chat_id = id AND user_id = auth.uid() AND role IN ('creator', 'admin')));

-- CHAT MEMBERS
CREATE POLICY "Chat members select" ON public.chat_members FOR SELECT USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_public_chat(chat_id) OR public.is_chat_member(chat_id));
CREATE POLICY "Chat members insert" ON public.chat_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Chat members update" ON public.chat_members FOR UPDATE USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('creator', 'admin')));

-- MESSAGES
CREATE POLICY "Messages select" ON public.messages FOR SELECT USING (public.is_admin(auth.uid()) OR public.is_chat_member(chat_id));
CREATE POLICY "Messages insert" ON public.messages FOR INSERT WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(chat_id));
CREATE POLICY "Messages update" ON public.messages FOR UPDATE USING (sender_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_chat_member(chat_id));
CREATE POLICY "Messages delete" ON public.messages FOR DELETE USING (sender_id = auth.uid() OR public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.chat_id = messages.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('creator', 'admin')));

-- Прочие таблицы: shorts, mini_apps, transfers (Они уже нормально настроены, без рекурсий)
DROP POLICY IF EXISTS "Anyone can read shorts" ON public.shorts;
CREATE POLICY "Anyone can read shorts" ON public.shorts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Shorts insert" ON public.shorts;
CREATE POLICY "Shorts insert" ON public.shorts FOR INSERT WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Shorts update" ON public.shorts;
CREATE POLICY "Shorts update" ON public.shorts FOR UPDATE USING (true); 
DROP POLICY IF EXISTS "Shorts delete" ON public.shorts;
CREATE POLICY "Shorts delete" ON public.shorts FOR DELETE USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can read their own transfers" ON public.vib_transfers;
CREATE POLICY "Users can read their own transfers" ON public.vib_transfers FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR public.is_admin(auth.uid()));


-- ==============================================================================
-- 4. НАСТРОЙКА STORAGE И REALTIME
-- ==============================================================================

-- Создаем все нужные бакеты. 
-- *ЗАМЕТКА: Приложение активно использует Cloudinary для изображений/картинок чата.
-- Но Supabase Storage нужно для 'shorts' и если вы используете встроенный storage.
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_media', 'vibegram_media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_voice_video', 'vibegram_voice_video', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vibegram_avatars', 'vibegram_avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('shorts', 'shorts', true) ON CONFLICT (id) DO NOTHING;

-- Включаем политики для Storage
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read voice and video" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload voice and video" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read shorts media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shorts media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their shorts media" ON storage.objects;

CREATE POLICY "Anyone can read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_avatars');
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_avatars');
CREATE POLICY "Users can update their avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'vibegram_avatars');

CREATE POLICY "Anyone can read media" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_media');
CREATE POLICY "Authenticated users can upload media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_media');

CREATE POLICY "Anyone can read voice and video" ON storage.objects FOR SELECT USING (bucket_id = 'vibegram_voice_video');
CREATE POLICY "Authenticated users can upload voice and video" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vibegram_voice_video');

CREATE POLICY "Anyone can read shorts media" ON storage.objects FOR SELECT USING (bucket_id = 'shorts');
CREATE POLICY "Authenticated users can upload shorts media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'shorts');
CREATE POLICY "Users can delete their shorts media" ON storage.objects FOR DELETE USING (bucket_id = 'shorts' AND auth.uid() = owner);


-- Подключение таблиц к Realtime подпискам
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- КОНЕЦ СКРИПТА
