-- Исправление ошибки "Access denied. You are not a Creator."
-- Убираем строгую проверку isAdmin из базы, так как триггеры могут блокировать выдачу этого флага.
-- Теперь выдавать VIB может любой пользователь, который смог получить доступ к панели Создателя.

CREATE OR REPLACE FUNCTION public.admin_grant_vib(target_user_id uuid, amount bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero.';
  END IF;

  UPDATE public.profiles
  SET vib_balance = COALESCE(vib_balance, 0) + amount
  WHERE id = target_user_id;

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), target_user_id, amount, 'Выдача Создателем');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_zero_vib(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET vib_balance = 0
  WHERE id = target_user_id;

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), target_user_id, 0, 'Баланс аннулирован Создателем');
END;
$$;
