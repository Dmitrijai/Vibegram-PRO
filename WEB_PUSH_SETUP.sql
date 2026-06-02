-- SQL script to add fcm_web_token to the existing profiles table.
-- You can run this in the SQL Editor in Supabase.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS fcm_web_token text;
