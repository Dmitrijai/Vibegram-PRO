-- Выполните этот SQL-скрипт в SQL Editor вашей панели управления Supabase

-- 1. Создаем таблицу настроек администратора (если ее нет)
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Настройки RLS для admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all users for admin_settings"
  ON public.admin_settings FOR SELECT
  USING (true);

CREATE POLICY "Allow update access to admins only for admin_settings"
  ON public.admin_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.settings->>'is_tech_support' = 'true' OR profiles.settings->>'isAdmin' = 'true')
    )
  );

-- Добавляем начальное значение для бонуса VIB, если таблицы была только создана
INSERT INTO public.admin_settings (key, value)
VALUES ('weekly_vib_bonus', '15')
ON CONFLICT (key) DO NOTHING;


-- 2. Функция для административной выдачи VIB (для еженедельных бонусов)
CREATE OR REPLACE FUNCTION public.admin_grant_vib(target_user_id uuid, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Выполняется с правами создателя функции
SET search_path = public
AS $$
BEGIN
  -- Обновляем баланс пользователя
  UPDATE public.profiles
  SET fib_balance = COALESCE(fib_balance, 0) + amount
  WHERE id = target_user_id;

  -- Записываем транзакцию в историю (sender_id = NULL или ID системы)
  -- Если в vib_transfers sender_id не может быть NULL, можно использовать самого получателя как отправителя
  -- с пометкой "Еженедельный бонус" 
  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (target_user_id, target_user_id, amount, 'Еженедельный бонус за активность');
END;
$$;


-- 3. Разрешить чтение истории переводов VIB 
-- (если администраторам нужно видеть всю историю vib_transfers)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'vib_transfers' AND policyname = 'Admins can view all transfers'
    ) THEN
        CREATE POLICY "Admins can view all transfers" 
        ON public.vib_transfers FOR SELECT 
        USING (
            EXISTS (
              SELECT 1 FROM public.profiles 
              WHERE profiles.id = auth.uid() 
              AND (profiles.settings->>'is_tech_support' = 'true' OR profiles.settings->>'isAdmin' = 'true')
            )
        );
    END IF;
END $$;

-- 4. Функция для перевода VIB от пользователя к пользователю
CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id  uuid, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_balance integer;
BEGIN
  -- 1. Проверяем баланс отправителя
  SELECT COALESCE(fib_balance, 0) INTO sender_balance FROM public.profiles WHERE id = auth.uid();
  IF sender_balance < amount THEN
    RAISE EXCEPTION 'Недостаточно средств для перевода';
  END IF;

  -- 2. Списываем VIB у отправителя
  UPDATE public.profiles
  SET fib_balance = sender_balance - amount
  WHERE id = auth.uid();

  -- 3. Добавляем VIB получателю
  UPDATE public.profiles
  SET fib_balance = COALESCE(fib_balance, 0) + amount
  WHERE id = receiver_id;

  -- Примечание: Таблица vib_transfers обновляется отдельно в коде (из-за поля messages),
  -- либо можете писать напрямую сюда.
END;
$$;
