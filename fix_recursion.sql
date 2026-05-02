DROP POLICY IF EXISTS "Chats select" ON public.chats;
DROP POLICY IF EXISTS "Chat members select" ON public.chat_members;
DROP POLICY IF EXISTS "Messages select" ON public.messages;

-- Create secure definer functions to bypass RLS and avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_chat_member(chat_id_arg uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURE DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_id = chat_id_arg AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_chat(chat_id_arg uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURE DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = chat_id_arg AND is_public = true
  );
$$;

-- Apply new policies
CREATE POLICY "Chats select" ON public.chats FOR SELECT USING (
  is_public = true OR public.is_admin(auth.uid()) OR public.is_chat_member(id)
);

CREATE POLICY "Chat members select" ON public.chat_members FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_public_chat(chat_id) OR public.is_chat_member(chat_id)
);

CREATE POLICY "Messages select" ON public.messages FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_chat_member(chat_id)
);

-- Fix update and delete policies too to avoid recursion
DROP POLICY IF EXISTS "Chats update" ON public.chats;
CREATE POLICY "Chats update" ON public.chats FOR UPDATE USING (
  public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.chat_members WHERE chat_id = id AND user_id = auth.uid() AND role IN ('creator', 'admin')
  )
);

DROP POLICY IF EXISTS "Chats delete" ON public.chats;
CREATE POLICY "Chats delete" ON public.chats FOR DELETE USING (
  public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.chat_members WHERE chat_id = id AND user_id = auth.uid() AND role = 'creator'
  )
);

DROP POLICY IF EXISTS "Chat members update" ON public.chat_members;
CREATE POLICY "Chat members update" ON public.chat_members FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('creator', 'admin')
  )
);

DROP POLICY IF EXISTS "Chat members delete" ON public.chat_members;
CREATE POLICY "Chat members delete" ON public.chat_members FOR DELETE USING (
  user_id = auth.uid() OR public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('creator', 'admin')
  )
);

DROP POLICY IF EXISTS "Messages insert" ON public.messages;
CREATE POLICY "Messages insert" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND public.is_chat_member(chat_id)
);

DROP POLICY IF EXISTS "Messages delete" ON public.messages;
CREATE POLICY "Messages delete" ON public.messages FOR DELETE USING (
  sender_id = auth.uid() OR public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.chat_members cm WHERE cm.chat_id = messages.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('creator', 'admin')
  )
);
