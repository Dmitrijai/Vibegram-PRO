-- Скрипт для починки статуса "прочитано" для сообщений
-- Подключитесь к SQL Editor в Supabase и выполните этот скрипт.
-- Проблема была в том, что политика (RLS) блокировала изменение чужих сообщений
-- при попытке отметить их прочитанными.

BEGIN;

DROP POLICY IF EXISTS "Messages update" ON public.messages;

-- Эта политика разрешит участникам чата обновлять сообщения внутри него 
-- (это необходимо для работы логики выставления is_read = true и reactions).
CREATE POLICY "Messages update" ON public.messages 
FOR UPDATE USING (
  sender_id = auth.uid() OR 
  public.is_admin(auth.uid()) OR 
  public.is_chat_member(chat_id)
);

COMMIT;
