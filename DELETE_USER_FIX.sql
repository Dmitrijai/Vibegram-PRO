-- 1. Сначала исправим ошибку базы данных с таблицей переводов VIB
-- Ограничение ключа мешает удалить профиль (violates foreign key constraint "vib_transfers_receiver_id_fkey")
DO $$ 
DECLARE
  fk_name text;
BEGIN
  -- Исправляем для sender_id
  SELECT constraint_name INTO fk_name 
  FROM information_schema.key_column_usage 
  WHERE table_name = 'vib_transfers' AND column_name = 'sender_id' 
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.vib_transfers DROP CONSTRAINT ' || fk_name;
  END IF;

  ALTER TABLE public.vib_transfers 
  ADD CONSTRAINT vib_transfers_sender_id_fkey 
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

  -- Исправляем для receiver_id
  SELECT constraint_name INTO fk_name 
  FROM information_schema.key_column_usage 
  WHERE table_name = 'vib_transfers' AND column_name = 'receiver_id' 
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.vib_transfers DROP CONSTRAINT ' || fk_name;
  END IF;

  ALTER TABLE public.vib_transfers 
  ADD CONSTRAINT vib_transfers_receiver_id_fkey 
  FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

END $$;

-- 2. Добавим политику для прямого удаления профилей
DROP POLICY IF EXISTS "Profiles delete" ON public.profiles;
CREATE POLICY "Profiles delete" ON public.profiles FOR DELETE USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- 3. Функция для полноценного удаления пользователя администратором из системы авторизации
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Проверяем права вызывающего (создатель или админ)
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Only admins or tech support can delete users.';
  END IF;

  -- Безопасная проверка: нельзя удалить самого себя
  IF auth.uid() = target_user_id THEN
    RAISE EXCEPTION 'You cannot delete yourself using this function.';
  END IF;

  -- Удаляем из auth.users. 
  -- Это КАСКАДНО удалит запись в public.profiles
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
