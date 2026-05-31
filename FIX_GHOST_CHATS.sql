-- Remove SAVED_MESSAGES description and Избранное title from any direct chats
UPDATE public.chats 
SET description = NULL, title = NULL
WHERE type = 'direct' AND description = 'SAVED_MESSAGES';
