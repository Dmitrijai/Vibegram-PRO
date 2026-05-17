-- Исправление функции с бонусами и переводами, удаляем дубликаты функций, которые вызывали ошибку базы данных!
DROP FUNCTION IF EXISTS public.system_grant_vib(integer, text);
DROP FUNCTION IF EXISTS public.transfer_vib(uuid, integer, text);
