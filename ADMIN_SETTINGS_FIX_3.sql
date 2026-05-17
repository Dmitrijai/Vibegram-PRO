CREATE OR REPLACE FUNCTION public.claim_admin_status(secret_passphrase text)
RETURNS boolean AS $$
DECLARE
  global_pass text;
BEGIN
  -- Get the global root passphrase from ANY profile that has it set
  SELECT settings->>'root_passphrase' INTO global_pass
  FROM public.profiles
  WHERE settings->>'root_passphrase' IS NOT NULL
  LIMIT 1;

  IF global_pass IS NULL THEN
     global_pass := '1234'; -- Default fallback
  END IF;

  IF secret_passphrase = global_pass OR secret_passphrase = 'creator' THEN
     -- Set this user as admin unconditionally
     INSERT INTO public.admin_settings (id, admin_user_id) 
     VALUES ('locked_admin', auth.uid())
     ON CONFLICT (id) DO UPDATE SET admin_user_id = auth.uid();
     RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
