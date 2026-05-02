-- Скрипт для добавления Vibegram Premium и валюты VIB

-- 1. Добавляем колонки в таблицу профилей
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vib_balance bigint DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_until timestamp with time zone;

-- 2. Функция для техподдержки: выдача VIB пользователю
CREATE OR REPLACE FUNCTION public.admin_grant_vib(target_user_id uuid, amount bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Проверяем, является ли вызывающий функцию техподдержкой (из jsonb settings)
  IF NOT COALESCE((SELECT (settings->>'is_tech_support')::boolean FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied. You are not a tech support.';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero.';
  END IF;

  UPDATE public.profiles
  SET vib_balance = COALESCE(vib_balance, 0) + amount
  WHERE id = target_user_id;
END;
$$;

-- 3. Функция для перевода VIB другому пользователю
CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id uuid, amount bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_balance bigint;
BEGIN
  IF amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF auth.uid() = receiver_id THEN RAISE EXCEPTION 'Cannot transfer to yourself'; END IF;

  SELECT COALESCE(vib_balance, 0) INTO sender_balance FROM public.profiles WHERE id = auth.uid() FOR UPDATE;

  IF sender_balance < amount THEN RAISE EXCEPTION 'Insufficient VIB balance'; END IF;

  -- Снимаем у отправителя
  UPDATE public.profiles SET vib_balance = vib_balance - amount WHERE id = auth.uid();
  
  -- Зачисляем получателю
  UPDATE public.profiles SET vib_balance = COALESCE(vib_balance, 0) + amount WHERE id = receiver_id;
END;
$$;

-- 4. Функция для покупки Premium
CREATE OR REPLACE FUNCTION public.buy_premium(cost bigint, duration_days int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_balance bigint;
  current_premium_until timestamp with time zone;
BEGIN
  -- Цена должна быть строго больше 0
  IF cost <= 0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;

  SELECT COALESCE(vib_balance, 0), premium_until INTO current_balance, current_premium_until FROM public.profiles WHERE id = auth.uid() FOR UPDATE;

  IF current_balance < cost THEN RAISE EXCEPTION 'Insufficient VIB balance'; END IF;

  -- Снимаем баланс
  UPDATE public.profiles SET vib_balance = vib_balance - cost WHERE id = auth.uid();

  -- Увеличиваем срок премиума
  IF current_premium_until > now() THEN
    UPDATE public.profiles
    SET is_premium = true, premium_until = current_premium_until + make_interval(days => duration_days)
    WHERE id = auth.uid();
  ELSE
    UPDATE public.profiles
    SET is_premium = true, premium_until = now() + make_interval(days => duration_days)
    WHERE id = auth.uid();
  END IF;
END;
$$;
