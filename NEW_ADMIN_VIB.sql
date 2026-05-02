DROP FUNCTION IF EXISTS public.admin_grant_vib(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_grant_vib(uuid, bigint);

CREATE OR REPLACE FUNCTION public.admin_grant_vib(target_user_id uuid, amount bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Только Создатель (isAdmin = true) может выдавать VIB
  IF NOT COALESCE((SELECT (settings->>'isAdmin')::boolean FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied. You are not a Creator.';
  END IF;

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
  -- Только Создатель (isAdmin = true) может аннулировать VIB
  IF NOT COALESCE((SELECT (settings->>'isAdmin')::boolean FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied. You are not a Creator.';
  END IF;

  UPDATE public.profiles
  SET vib_balance = 0
  WHERE id = target_user_id;

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), target_user_id, 0, 'Баланс аннулирован Создателем');
END;
$$;
