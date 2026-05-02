-- Исправление для прочтения сообщений и реакций
-- Позволяет участникам чата обновлять сообщения (нужно для is_read и reactions)

DROP POLICY IF EXISTS "Messages update" ON public.messages;
CREATE POLICY "Messages update" ON public.messages FOR UPDATE USING (
  sender_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_chat_member(chat_id)
);
