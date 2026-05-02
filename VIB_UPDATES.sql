-- 1. Create table for VIB transfers
CREATE TABLE IF NOT EXISTS public.vib_transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id uuid REFERENCES public.profiles(id) NOT NULL,
    receiver_id uuid REFERENCES public.profiles(id) NOT NULL,
    amount bigint NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vib_transfers ENABLE ROW LEVEL SECURITY;

-- Policies for vib_transfers
CREATE POLICY "Users can read their own transfers" ON public.vib_transfers
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- System can make transfers via function

-- 2. Modify transfer_vib function to support note and log the transfer
CREATE OR REPLACE FUNCTION public.transfer_vib(receiver_id uuid, amount bigint, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_balance bigint;
BEGIN
  IF amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF amount > 10000 THEN RAISE EXCEPTION 'Max 10000 VIB per transfer'; END IF;
  IF auth.uid() = receiver_id THEN RAISE EXCEPTION 'Cannot transfer to yourself'; END IF;

  SELECT COALESCE(vib_balance, 0) INTO sender_balance FROM public.profiles WHERE id = auth.uid() FOR UPDATE;

  IF sender_balance < amount THEN RAISE EXCEPTION 'Insufficient VIB balance'; END IF;

  -- Снимаем у отправителя
  UPDATE public.profiles SET vib_balance = vib_balance - amount WHERE id = auth.uid();
  
  -- Зачисляем получателю
  UPDATE public.profiles SET vib_balance = COALESCE(vib_balance, 0) + amount WHERE id = receiver_id;

  -- Записываем историю
  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), receiver_id, amount, note);
END;
$$;

-- 3. Modify admin_grant_vib to log transfers too (from admin to user)
CREATE OR REPLACE FUNCTION public.admin_grant_vib(target_user_id uuid, amount bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT COALESCE((SELECT (settings->>'is_tech_support')::boolean FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied. You are not a tech support.';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero.';
  END IF;

  UPDATE public.profiles
  SET vib_balance = COALESCE(vib_balance, 0) + amount
  WHERE id = target_user_id;

  INSERT INTO public.vib_transfers (sender_id, receiver_id, amount, message)
  VALUES (auth.uid(), target_user_id, amount, 'Admin Grant');
END;
$$;

-- 4. Create table for global admin settings
CREATE TABLE IF NOT EXISTS public.admin_settings (
    key text PRIMARY KEY,
    value jsonb
);

INSERT INTO public.admin_settings (key, value)
VALUES ('weekly_vib_bonus', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Policy for admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read admin_settings" ON public.admin_settings FOR SELECT USING (true);
CREATE POLICY "Tech support can update admin_settings" ON public.admin_settings
    FOR UPDATE USING (
        COALESCE((SELECT (settings->>'is_tech_support')::boolean FROM public.profiles WHERE id = auth.uid()), false) = true
    );

-- 5. User daily logins
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consecutive_days int DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS time_spent_today interval DEFAULT '0 seconds'::interval;

-- We'll track it mostly locally and periodically send heartbeat to Supabase
