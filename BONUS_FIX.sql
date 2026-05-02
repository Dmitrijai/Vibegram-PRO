-- Исправление: обычные пользователи не могли получать ежедневный бонус из-за ограничения admin_grant_vib
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
  -- В качестве отправителя указываем самого пользователя или систему, 
  -- но таблица требует uuid. Пусть будет сам себе, но с пометкой.
  VALUES (auth.uid(), auth.uid(), amount, note);
END;
$$;
