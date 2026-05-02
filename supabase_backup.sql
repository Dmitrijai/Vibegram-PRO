-- Резервная копия структуры базы данных (Схема и Policies)

-- Создание таблиц
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  status text,
  is_online boolean default false,
  last_seen timestamp with time zone default now(),
  settings jsonb default '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.chats (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('direct', 'private', 'group', 'channel')),
  title text,
  description text,
  avatar_url text,
  invite_key text unique,
  is_public boolean default false,
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id uuid references public.chats on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  role text default 'member' check (role in ('creator', 'admin', 'member', 'pending')),
  joined_at timestamp with time zone default now(),
  primary key (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid default gen_random_uuid() primary key,
  chat_id uuid references public.chats on delete cascade not null,
  sender_id uuid references public.profiles on delete set null,
  content text,
  media jsonb default '[]'::jsonb,
  message_type text default 'text' check (message_type in ('text', 'voice', 'video_circle', 'poll')),
  parent_id uuid references public.messages on delete set null,
  is_read boolean default false,
  reactions jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.shorts (
  id uuid default gen_random_uuid() primary key,
  author_id uuid references public.profiles on delete cascade not null,
  video_url text not null,
  title text default 'Без названия',
  description text,
  views_count bigint default 0,
  likes_count bigint default 0,
  comments_count bigint default 0,
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.short_views (
  id uuid default gen_random_uuid() primary key,
  short_id uuid references public.shorts on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(short_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.short_likes (
  id uuid default gen_random_uuid() primary key,
  short_id uuid references public.shorts on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(short_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.short_comments (
  id uuid default gen_random_uuid() primary key,
  short_id uuid references public.shorts on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  text text not null,
  created_at timestamp with time zone default now()
);

-- Настройка RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_comments ENABLE ROW LEVEL SECURITY;

-- Создание простейших политик (разрешить все для авторизованных, чтобы не было конфликтов)
-- В реальном проекте здесь были бы более строгие проверки
CREATE POLICY "Enable all for authenticated users" ON public.profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.chats FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.chat_members FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.messages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.shorts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.short_views FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.short_likes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON public.short_comments FOR ALL USING (auth.role() = 'authenticated');

-- Обработчик для создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Публикация таблиц в Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
