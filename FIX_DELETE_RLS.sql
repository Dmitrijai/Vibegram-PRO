-- Создадим безопасную функцию для проверки роли без вызова политик RLS, чтобы избежать бесконечной рекурсии
CREATE OR REPLACE FUNCTION public.get_my_chat_role(c_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.chat_members WHERE chat_id = c_id AND user_id = auth.uid() LIMIT 1;
$$;

-- Обновим политики для chat_members
DROP POLICY IF EXISTS "Chat members update" ON public.chat_members;
CREATE POLICY "Chat members update" ON public.chat_members FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.get_my_chat_role(chat_id) IN ('creator', 'admin')
);

DROP POLICY IF EXISTS "Chat members delete" ON public.chat_members;
CREATE POLICY "Chat members delete" ON public.chat_members FOR DELETE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.get_my_chat_role(chat_id) IN ('creator', 'admin')
);

-- Обновим политики для chats
DROP POLICY IF EXISTS "Chats update" ON public.chats;
CREATE POLICY "Chats update" ON public.chats FOR UPDATE USING (
  public.is_admin(auth.uid()) OR public.get_my_chat_role(id) IN ('creator', 'admin')
);

DROP POLICY IF EXISTS "Chats delete" ON public.chats;
CREATE POLICY "Chats delete" ON public.chats FOR DELETE USING (
  public.is_admin(auth.uid()) OR public.get_my_chat_role(id) = 'creator'
);

-- Обновим политику удаления сообщений
DROP POLICY IF EXISTS "Messages delete" ON public.messages;
CREATE POLICY "Messages delete" ON public.messages FOR DELETE USING (
  sender_id = auth.uid() OR public.is_admin(auth.uid()) OR public.get_my_chat_role(chat_id) IN ('creator', 'admin')
);
