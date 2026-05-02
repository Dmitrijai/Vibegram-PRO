-- 1. Исправление для перевода: позволяет отправлять от 1 VIB (ранее было от 10)
CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id uuid, amount bigint, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_balance bigint;
BEGIN
  IF amount <= 0 THEN RAISE EXCEPTION 'Minimum amount is 1 VIB.'; END IF;
  IF amount > 10000 THEN RAISE EXCEPTION 'Max 10000 VIB per transfer'; END IF;
  IF auth.uid() = receiver_id THEN RAISE EXCEPTION 'Cannot transfer to yourself'; END IF;

  SELECT COALESCE(vib_balance, 0) INTO sender_balance FROM public.profiles WHERE id = auth.uid() FOR UPDATE;

  IF sender_balance < amount THEN RAISE EXCEPTION 'Insufficient VIB balance'; END IF;

  UPDATE public.profiles SET vib_balance = vib_balance - amount WHERE id = auth.uid();
  UPDATE public.profiles SET vib_balance = COALESCE(vib_balance, 0) + amount WHERE id = receiver_id;

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), receiver_id, amount, note);
END;
$$;

-- Также добавляем вариант со вторым аргументом INTEGER, на случай, если вызывается так
CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id uuid, amount integer, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.transfer_vib(receiver_id, amount::bigint, note);
END;
$$;

-- 2. Исправление для начисления бонусов: позволяет системе выдавать бонусы
CREATE OR REPLACE FUNCTION public.system_grant_vib(amount bigint, note text DEFAULT 'Ежедневный бонус')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF amount <= 0 OR amount > 100 THEN
    RAISE EXCEPTION 'Invalid amount for system grant.';
  END IF;

  UPDATE public.profiles
  SET vib_balance = COALESCE(vib_balance, 0) + amount
  WHERE id = auth.uid();

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), auth.uid(), amount, note);
END;
$$;

-- Вариант INTEGER для бонусов
CREATE OR REPLACE FUNCTION public.system_grant_vib(amount integer, note text DEFAULT 'Ежедневный бонус')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.system_grant_vib(amount::bigint, note);
END;
$$;
