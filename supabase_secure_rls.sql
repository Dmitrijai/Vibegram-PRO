-- 1. Создаем функцию администратора
CREATE OR REPLACE FUNCTION public.is_admin(user_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURE DEFINER
AS $$
  SELECT COALESCE((settings->>'is_tech_support')::boolean, false)
  FROM public.profiles
  WHERE id = user_uid;
$$;

-- 2. Защита от подделки прав (Триггер)
CREATE OR REPLACE FUNCTION public.protect_secure_settings()
RETURNS trigger AS $$
BEGIN
  -- Только реальные админы могут менять поля is_tech_support и root_passphrase
  IF NOT public.is_admin(auth.uid()) THEN
    IF OLD.settings ? 'is_tech_support' THEN
      NEW.settings = jsonb_set(NEW.settings, '{is_tech_support}', OLD.settings->'is_tech_support');
    ELSE
      NEW.settings = NEW.settings - 'is_tech_support';
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

-- 3. Закрываем всем таблицам доступ
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_views ENABLE ROW LEVEL SECURITY;

-- Удаляем старые небезопасные политики
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.chats;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.chat_members;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.messages;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.shorts;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.short_comments;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.short_likes;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.short_views;

-- 4. PROFILES (Чтение для всех, изменение только себе и админам)
CREATE POLICY "Profiles select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles update" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "Profiles delete" ON public.profiles FOR DELETE USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- 5. CHATS
CREATE POLICY "Chats select" ON public.chats FOR SELECT USING (
  is_public = true OR public.is_admin(auth.uid()) OR id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid())
);
CREATE POLICY "Chats insert" ON public.chats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Chats update" ON public.chats FOR UPDATE USING (
  public.is_admin(auth.uid()) OR id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid() AND role IN ('creator', 'admin'))
);
CREATE POLICY "Chats delete" ON public.chats FOR DELETE USING (
  public.is_admin(auth.uid()) OR id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid() AND role = 'creator')
);

-- 6. CHAT_MEMBERS
CREATE POLICY "Chat members select" ON public.chat_members FOR SELECT USING (
  public.is_admin(auth.uid()) OR chat_id IN (SELECT id FROM public.chats WHERE is_public = true) OR chat_id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid())
);
CREATE POLICY "Chat members insert" ON public.chat_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Chat members update" ON public.chat_members FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR chat_id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid() AND role IN ('creator', 'admin'))
);
CREATE POLICY "Chat members delete" ON public.chat_members FOR DELETE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR chat_id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid() AND role IN ('creator', 'admin'))
);

-- 7. MESSAGES (Защита переписок!)
CREATE POLICY "Messages select" ON public.messages FOR SELECT USING (
  public.is_admin(auth.uid()) OR chat_id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid())
);
CREATE POLICY "Messages insert" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND chat_id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid())
);
CREATE POLICY "Messages update" ON public.messages FOR UPDATE USING (
  sender_id = auth.uid() OR public.is_admin(auth.uid())
);
CREATE POLICY "Messages delete" ON public.messages FOR DELETE USING (
  sender_id = auth.uid() OR public.is_admin(auth.uid()) OR chat_id IN (SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid() AND role IN ('creator', 'admin'))
);

-- 8. SHORTS (Удаление чужих данных)
CREATE POLICY "Shorts select" ON public.shorts FOR SELECT USING (true);
CREATE POLICY "Shorts insert" ON public.shorts FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Shorts update" ON public.shorts FOR UPDATE USING (author_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Shorts delete" ON public.shorts FOR DELETE USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Shorts comments select" ON public.short_comments FOR SELECT USING (true);
CREATE POLICY "Shorts comments insert" ON public.short_comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Shorts comments update" ON public.short_comments FOR UPDATE USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Shorts comments delete" ON public.short_comments FOR DELETE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR short_id IN (SELECT id FROM public.shorts WHERE author_id = auth.uid())
);

CREATE POLICY "Shorts likes and views" ON public.short_likes FOR ALL USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Shorts views" ON public.short_views FOR ALL USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
