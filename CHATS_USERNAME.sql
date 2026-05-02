ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS username text UNIQUE;
